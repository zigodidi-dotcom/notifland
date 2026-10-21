import { createHash } from 'node:crypto';
import { redis, SUBS_KEY } from '../lib/redis.js';

const MAX_ENDPOINT_LENGTH = 2048;

function isValidSubscription(sub) {
  if (!sub || typeof sub !== 'object') return false;
  const { endpoint, keys } = sub;
  if (typeof endpoint !== 'string' || endpoint.length > MAX_ENDPOINT_LENGTH) return false;
  try {
    if (new URL(endpoint).protocol !== 'https:') return false;
  } catch {
    return false;
  }
  return (
    keys &&
    typeof keys.p256dh === 'string' && keys.p256dh.length > 0 && keys.p256dh.length < 256 &&
    typeof keys.auth === 'string' && keys.auth.length > 0 && keys.auth.length < 128
  );
}

export default async function handler(req, res) {
  // GET : la page récupère la clé publique VAPID pour s'abonner.
  if (req.method === 'GET') {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) return res.status(500).json({ error: 'VAPID_PUBLIC_KEY manquante' });
    return res.status(200).json({ publicKey });
  }

  // POST : enregistre l'abonnement, anonymement (aucune donnée perso).
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = null; }
    }
    if (!isValidSubscription(body)) {
      return res.status(400).json({ error: 'Abonnement invalide' });
    }

    const subscription = {
      endpoint: body.endpoint,
      keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
    };
    const id = createHash('sha256').update(subscription.endpoint).digest('hex');

    try {
      await redis().hset(SUBS_KEY, { [id]: JSON.stringify(subscription) });
    } catch (err) {
      console.error('subscribe:', err);
      return res.status(500).json({ error: 'Stockage indisponible' });
    }
    return res.status(201).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Méthode non autorisée' });
}
