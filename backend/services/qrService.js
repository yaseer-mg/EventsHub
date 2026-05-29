const QRCode = require('qrcode');
const crypto = require('crypto');

function slugify(value) {
  return String(value || 'pass')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'pass';
}

function generateQRToken(context = {}) {
  const prefix = [context.eventName, context.tag]
    .filter(Boolean)
    .map(slugify)
    .join('.');
  const random = crypto.randomBytes(24).toString('hex');

  return prefix ? `${prefix}.${random}` : random;
}

async function generateQRDataURL(token) {
  return await QRCode.toDataURL(token, {
    width: 300,
    margin: 2,
    color: {
      dark: '#1e293b',
      light: '#ffffff',
    },
  });
}

module.exports = {
  generateQRToken,
  generateQRDataURL,
};
