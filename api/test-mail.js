import { sendAlert } from '../lib/alert.js';
import { isAuthorized } from '../lib/auth.js';

// Envoie un mail de test à ALERT_EMAIL pour vérifier la configuration Resend.
// Protégé par STATS_SECRET (en-tête Authorization: Bearer … ou ?key=…).
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }
  if (!isAuthorized(req, process.env.STATS_SECRET, { allowQuery: true })) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const date = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  const result = await sendAlert(
    'COGITOBE : mail de test',
    `Ceci est un mail de test envoyé le ${date}.\nSi tu le lis, les alertes de paliers (tous les 1000 inscrits) fonctionneront.`
  );

  if (!result.ok) {
    return res.status(502).json({ sent: false, to: process.env.ALERT_EMAIL || null, ...result });
  }
  return res.status(200).json({ sent: true, to: process.env.ALERT_EMAIL, id: result.id });
}
