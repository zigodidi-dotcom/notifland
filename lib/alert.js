// Envoi d'un mail d'alerte via l'API HTTP de Resend (resend.com), sans dépendance.
// Variables : RESEND_API_KEY (obligatoire), ALERT_EMAIL (destinataire),
// ALERT_FROM (facultatif, par défaut l'expéditeur de test de Resend).
// Retourne { ok: true, id } ou { ok: false, status, error } : ne lève jamais d'exception.
export async function sendAlert(subject, text) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL;
  if (!apiKey || !to) {
    const error = `${!apiKey ? 'RESEND_API_KEY' : 'ALERT_EMAIL'} manquante`;
    console.warn('alert:', error, '— mail non envoyé :', subject);
    return { ok: false, status: null, error };
  }

  try {
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

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('alert: échec Resend', res.status, body);
      return { ok: false, status: res.status, error: body.message || body.name || 'Erreur Resend' };
    }
    return { ok: true, id: body.id };
  } catch (err) {
    console.error('alert: Resend injoignable', err);
    return { ok: false, status: null, error: err.message };
  }
}
