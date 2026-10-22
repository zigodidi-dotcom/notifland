// Envoi d'un mail d'alerte via l'API HTTP de Resend (resend.com), sans dépendance.
// Variables : RESEND_API_KEY (obligatoire), ALERT_EMAIL (destinataire),
// ALERT_FROM (facultatif, par défaut l'expéditeur de test de Resend).
export async function sendAlert(subject, text) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL;
  if (!apiKey || !to) {
    console.warn('alert: RESEND_API_KEY ou ALERT_EMAIL manquant, mail non envoyé :', subject);
    return false;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.ALERT_FROM || 'COGITOBE <onboarding@resend.dev>',
      to: [to],
      subject,
      text,
    }),
  });

  if (!res.ok) {
    console.error('alert: échec Resend', res.status, await res.text().catch(() => ''));
    return false;
  }
  return true;
}
