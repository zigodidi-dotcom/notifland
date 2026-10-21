import { redis, SUBS_KEY } from '../lib/redis.js';
import { isAuthorized } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }
  if (!isAuthorized(req, process.env.STATS_SECRET, { allowQuery: true })) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  try {
    const subscribers = await redis().hlen(SUBS_KEY);
    return res.status(200).json({ subscribers });
  } catch (err) {
    console.error('stats:', err);
    return res.status(500).json({ error: 'Stockage indisponible' });
  }
}
