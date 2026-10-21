import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import webpush from 'web-push';
import { redis, SUBS_KEY } from '../lib/redis.js';
import { isAuthorized } from '../lib/auth.js';

const BATCH_SIZE = 50;

let messagesCache;
function loadMessages() {
  if (!messagesCache) {
    const raw = readFileSync(join(process.cwd(), 'messages.json'), 'utf8');
    messagesCache = JSON.parse(raw).messages;
  }
  return messagesCache;
}

function parseSubscription(value) {
  // @upstash/redis désérialise automatiquement le JSON ; on gère les deux cas.
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return value && typeof value === 'object' ? value : null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }
  if (!isAuthorized(req, process.env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) {
    return res.status(500).json({ error: 'Clés VAPID manquantes' });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  const messages = loadMessages();
  const message = messages[Math.floor(Math.random() * messages.length)];
  const payload = JSON.stringify({ title: message.text, lang: message.lang });

  let entries;
  try {
    entries = Object.entries((await redis().hgetall(SUBS_KEY)) || {});
  } catch (err) {
    console.error('send: lecture Redis', err);
    return res.status(500).json({ error: 'Stockage indisponible' });
  }

  let sent = 0;
  let failed = 0;
  const expired = [];

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(([, value]) => {
        const sub = parseSubscription(value);
        if (!sub?.endpoint) return Promise.reject({ statusCode: 410 });
        // TTL 1 h : inutile de livrer une phrase périmée quand la suivante arrive.
        return webpush.sendNotification(sub, payload, { TTL: 3600, urgency: 'normal' });
      })
    );

    results.forEach((result, j) => {
      if (result.status === 'fulfilled') {
        sent++;
        return;
      }
      const code = result.reason?.statusCode;
      if (code === 404 || code === 410) {
        expired.push(batch[j][0]); // abonnement expiré ou révoqué
      } else {
        failed++;
        console.warn('send: échec', code, result.reason?.body || result.reason?.message);
      }
    });
  }

  if (expired.length) {
    try {
      await redis().hdel(SUBS_KEY, ...expired);
    } catch (err) {
      console.error('send: suppression des expirés', err);
    }
  }

  return res.status(200).json({
    message: message.text,
    total: entries.length,
    sent,
    removed: expired.length,
    failed,
  });
}
