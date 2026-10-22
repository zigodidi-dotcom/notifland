import { createHash } from 'node:crypto';
import { redis, SUBS_KEY, MILESTONES_KEY, MAX_SUBSCRIBERS, ALERT_EVERY } from '../lib/redis.js';
import { sendAlert } from '../lib/alert.js';

const MAX_ENDPOINT_LENGTH = 2048;

// Inscription atomique (script Lua exécuté d'un bloc par Redis, donc pas de
// dépassement du plafond même si des centaines de personnes cliquent en même temps).
// Retour : 0 = déjà inscrit (abonnement mis à jour), -1 = complet, n = nouveau total.
const SUBSCRIBE_SCRIPT = `
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then
  redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
  return 0
end
local n = redis.call('HLEN', KEYS[1])
if n >= tonumber(ARGV[3]) then
  return -1
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return n + 1
`;

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

// Un mail par palier (1000, 2000…), une seule fois même si le total redescend puis remonte.
async function notifyMilestone(total) {
  if (total % ALERT_EVERY !== 0) return;
  const isNew = await redis().sadd(MILESTONES_KEY, String(total));
  if (!isNew) return;

  const full = total >= MAX_SUBSCRIBERS;
  const subject = full
    ? `COGITOBE : complet, ${total} inscrits`
    : `COGITOBE : ${total} inscrits`;
  const text = full
    ? `La file est pleine : ${total} / ${MAX_SUBSCRIBERS} inscrits. Les nouveaux visiteurs voient le message « trop tard ».`
    : `Nouveau palier atteint : ${total} inscrits (plafond : ${MAX_SUBSCRIBERS}).`;
  await sendAlert(subject, text);
}

export default async function handler(req, res) {
  // GET : clé publique VAPID + état de la file, pour la page.
  if (req.method === 'GET') {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) return res.status(500).json({ error: 'VAPID_PUBLIC_KEY manquante' });
    let full = false;
    try {
      full = (await redis().hlen(SUBS_KEY)) >= MAX_SUBSCRIBERS;
    } catch (err) {
      console.error('subscribe GET:', err);
    }
    return res.status(200).json({ publicKey, full });
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

    let result;
    try {
      result = Number(await redis().eval(
        SUBSCRIBE_SCRIPT,
        [SUBS_KEY],
        [id, JSON.stringify(subscription), String(MAX_SUBSCRIBERS)]
      ));
    } catch (err) {
      console.error('subscribe:', err);
      return res.status(500).json({ error: 'Stockage indisponible' });
    }

    if (result === -1) {
      return res.status(409).json({ error: 'full' });
    }

    if (result > 0) {
      // L'alerte ne doit jamais faire échouer l'inscription.
      try {
        await notifyMilestone(result);
      } catch (err) {
        console.error('subscribe: alerte palier', err);
      }
    }
    return res.status(result === 0 ? 200 : 201).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Méthode non autorisée' });
}
