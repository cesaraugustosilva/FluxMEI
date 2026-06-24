const DEFAULT_PROVIDER = 'resend';

function getEmailProvider() {
  return (process.env.EMAIL_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase();
}

function getEmailFrom() {
  return process.env.EMAIL_FROM || 'FluxMEI <no-reply@fluxmei.com.br>';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildHtml({ title, preheader, body, ctaLabel, ctaUrl }) {
  const paragraphs = Array.isArray(body) ? body : [body];
  const safeCta = ctaUrl || process.env.FRONTEND_URL || 'https://fluxmei.com.br/app/';

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#eef7f1;font-family:Arial,sans-serif;color:#10231a;">
    <span style="display:none;opacity:0">${escapeHtml(preheader || title)}</span>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef7f1;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d8eadf;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:24px 24px 12px;">
                <div style="font-size:14px;font-weight:800;color:#087333;">FluxMEI</div>
                <h1 style="margin:10px 0 0;font-size:24px;line-height:1.2;color:#10231a;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 10px;">
                ${paragraphs.map((item) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#334844;">${escapeHtml(item)}</p>`).join('')}
              </td>
            </tr>
            ${ctaLabel ? `<tr>
              <td style="padding:8px 24px 26px;">
                <a href="${escapeHtml(safeCta)}" style="display:inline-block;background:#30b841;color:#ffffff;text-decoration:none;font-weight:800;border-radius:8px;padding:12px 16px;">${escapeHtml(ctaLabel)}</a>
              </td>
            </tr>` : ''}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendEmail({ to, subject, html, text }) {
  if (!to) return { skipped: true, reason: 'missing_to' };

  const provider = getEmailProvider();
  if (provider !== 'resend') {
    console.info('[email]', { provider, outcome: 'skipped_unsupported_provider' });
    return { skipped: true, reason: 'unsupported_provider' };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.info('[email]', { provider, outcome: 'skipped_missing_resend_key' });
    return { skipped: true, reason: 'missing_api_key' };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: getEmailFrom(),
      to,
      subject,
      html,
      text
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[email]', {
      provider,
      status: response.status,
      outcome: 'send_failed'
    });
    return { sent: false, provider, status: response.status, error: payload?.message || 'send_failed' };
  }

  console.info('[email]', { provider, outcome: 'sent', message_id: payload?.id || null });
  return { sent: true, provider, id: payload?.id || null };
}

export const emailService = {
  buildHtml,
  sendEmail
};
