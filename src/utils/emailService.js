const nodemailer = require('nodemailer');

// Configuration via variables d'environnement
const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
  APP_NAME = 'Tranoo',
  WEB_ADMIN_URL,
} = process.env;

let transporter = null;

function getTransporter() {
  if (!transporter) {
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      console.warn('[EMAIL] SMTP non configuré (SMTP_HOST/SMTP_USER/SMTP_PASS manquants)');
      return null;
    }
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });
  }
  return transporter;
}

// Template HTML pour les messages de vérification / rapport
function buildVerificationEmailHtml({ user, title, message, details, date, article }) {
  const safeName = user ? `${user.prenoms || ''} ${user.nom || ''}`.trim() || 'Cher client' : 'Cher client';
  const displayDate = date ? new Date(date).toLocaleString('fr-FR') : new Date().toLocaleString('fr-FR');
  const articleTitle = article?.titre || '';
  const articleType = article?.type || '';

  return `
<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <title>${APP_NAME} - ${title}</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
          Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        background-color: #f5f7fb;
        margin: 0;
        padding: 0;
      }
      .container {
        max-width: 640px;
        margin: 24px auto;
        background-color: #ffffff;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
        overflow: hidden;
      }
      .header {
        padding: 20px 24px;
        background: linear-gradient(135deg, #f8bf13, #f59e0b);
        color: #111827;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .header-title {
        font-size: 20px;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .badge {
        padding: 4px 10px;
        border-radius: 999px;
        background-color: rgba(17, 24, 39, 0.1);
        font-size: 11px;
        font-weight: 600;
      }
      .content {
        padding: 24px 24px 16px 24px;
        color: #111827;
      }
      h1 {
        font-size: 22px;
        margin: 0 0 12px 0;
        color: #111827;
      }
      p {
        font-size: 14px;
        line-height: 1.6;
        margin: 0 0 12px 0;
        color: #374151;
      }
      .meta {
        font-size: 12px;
        color: #6b7280;
        margin-bottom: 16px;
      }
      .card {
        border-radius: 10px;
        border: 1px solid #e5e7eb;
        background-color: #f9fafb;
        padding: 14px 16px;
        margin-bottom: 16px;
      }
      .card-title {
        font-size: 13px;
        font-weight: 700;
        color: #111827;
        margin-bottom: 6px;
      }
      .card-row {
        font-size: 13px;
        color: #4b5563;
        margin-bottom: 4px;
      }
      .label {
        font-weight: 600;
      }
      .footer {
        padding: 14px 24px 18px 24px;
        border-top: 1px solid #e5e7eb;
        background-color: #f9fafb;
        font-size: 11px;
        color: #9ca3af;
        text-align: center;
      }
      .conditions {
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: 8px;
        background-color: #fef2f2;
        border: 1px solid #fecaca;
        color: #b91c1c;
        font-weight: 700;
        font-size: 12px;
      }
      a.button {
        display: inline-block;
        margin-top: 14px;
        padding: 10px 18px;
        border-radius: 999px;
        background-color: #111827;
        color: #f9fafb !important;
        font-size: 13px;
        font-weight: 600;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div class="header-title">${APP_NAME}</div>
        <div class="badge">Rapport de vérification</div>
      </div>
      <div class="content">
        <p class="meta">${displayDate}</p>
        <h1>${title}</h1>
        <p>Bonjour ${safeName},</p>
        <p>${message}</p>

        ${details ? `<div class="card">
          <div class="card-title">Détails complémentaires</div>
          <div class="card-row">${details}</div>
        </div>` : ''}

        ${
          articleTitle
            ? `<div class="card">
                 <div class="card-title">Article concerné</div>
                 <div class="card-row"><span class="label">Titre :</span> ${articleTitle}</div>
                 ${
                   articleType
                     ? `<div class="card-row"><span class="label">Type :</span> ${articleType}</div>`
                     : ''
                 }
               </div>`
            : ''
        }

        <div class="conditions">
          En cas de refus du colis, vous serez remboursé uniquement des frais du colis.
          Les frais de livraison restent dus et ne seront pas remboursés.
        </div>

        ${
          WEB_ADMIN_URL
            ? `<p><a class="button" href="${WEB_ADMIN_URL}" target="_blank" rel="noopener">Accéder à mon espace client</a></p>`
            : ''
        }

        <p style="margin-top:18px;">Cordialement,<br>L'équipe ${APP_NAME}</p>
      </div>
      <div class="footer">
        Cet email vous a été envoyé automatiquement depuis ${APP_NAME}. Merci de ne pas y répondre directement.
      </div>
    </div>
  </body>
</html>
`;
}

async function sendMail({ to, subject, html }) {
  const transport = getTransporter();
  if (!transport) {
    console.warn('[EMAIL] Transporter non disponible, email ignoré.');
    return { skipped: true };
  }

  const from = MAIL_FROM || `"${APP_NAME}" <no-reply@tranoo.app>`;

  const info = await transport.sendMail({
    from,
    to,
    subject,
    html,
  });

  console.log('[EMAIL] Message envoyé:', info.messageId);
  return info;
}

module.exports = {
  sendMail,
  buildVerificationEmailHtml,
};

