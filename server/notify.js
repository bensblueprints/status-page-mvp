// Subscriber email notifications over SMTP — always soft-fail.
const nodemailer = require('nodemailer');
const { getSettings } = require('./db');

function smtpConfigured(s) {
  return Boolean(s.smtp_host && s.smtp_from);
}

async function sendEmail(settings, to, subject, text) {
  if (!smtpConfigured(settings)) return { skipped: true };
  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: Number(settings.smtp_port) || 587,
    secure: Number(settings.smtp_port) === 465,
    auth: settings.smtp_user ? { user: settings.smtp_user, pass: settings.smtp_pass } : undefined
  });
  await transporter.sendMail({ from: settings.smtp_from, to, subject, text });
  return { sent: true };
}

async function notifySubscribers(db, subject, body) {
  const settings = getSettings(db);
  if (!smtpConfigured(settings)) return { skipped: true, recipients: 0 };
  const subs = db.prepare('SELECT * FROM subscribers WHERE confirmed = 1').all();
  const base = (settings.base_url || '').replace(/\/$/, '');
  let sent = 0;
  for (const sub of subs) {
    const footer = base ? `\n\n—\nUnsubscribe: ${base}/unsubscribe/${sub.token}` : '';
    try {
      await sendEmail(settings, sub.email, subject, body + footer);
      sent++;
    } catch (e) {
      console.warn('[notify]', sub.email, e.message);
    }
  }
  return { sent, recipients: subs.length };
}

module.exports = { sendEmail, notifySubscribers, smtpConfigured };
