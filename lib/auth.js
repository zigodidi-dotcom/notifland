import { createHash, timingSafeEqual } from 'node:crypto';

// Vérifie un secret transmis via "Authorization: Bearer <secret>"
// (ou ?key=<secret> si allowQuery, pratique pour ouvrir /api/stats dans un navigateur).
export function isAuthorized(req, secret, { allowQuery = false } = {}) {
  if (!secret) return false;

  const header = req.headers.authorization || '';
  let provided = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!provided && allowQuery && typeof req.query?.key === 'string') {
    provided = req.query.key;
  }
  if (!provided) return false;

  // Comparaison à temps constant sur des empreintes de même longueur.
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(secret).digest();
  return timingSafeEqual(a, b);
}
