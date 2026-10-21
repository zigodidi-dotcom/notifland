import { Redis } from '@upstash/redis';

// Hash Redis : clé = sha256(endpoint), valeur = abonnement push (JSON).
export const SUBS_KEY = 'dont-scroll:subs';

let client;

// Accepte les noms de variables d'Upstash (console upstash.com)
// et ceux posés par l'intégration Vercel Marketplace (KV_REST_API_*).
export function redis() {
  if (!client) {
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) {
      throw new Error('Upstash Redis non configuré (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN).');
    }
    client = new Redis({ url, token });
  }
  return client;
}
