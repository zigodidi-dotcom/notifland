import { Redis } from '@upstash/redis';

// Hash Redis : clé = sha256(endpoint), valeur = abonnement push (JSON).
export const SUBS_KEY = 'dont-scroll:subs';
// Set des paliers (1000, 2000…) déjà signalés par mail, pour n'alerter qu'une fois.
export const MILESTONES_KEY = 'dont-scroll:milestones';

// Plafond d'inscrits (modifiable via la variable MAX_SUBSCRIBERS).
export const MAX_SUBSCRIBERS = Number(process.env.MAX_SUBSCRIBERS) || 8000;
// Une alerte mail tous les N inscrits.
export const ALERT_EVERY = 1000;

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
