const { getPdfByToken } = require('../utils/verificationPdfCache');

exports.serveVerificationReportPdf = (req, res) => {
  const entry = getPdfByToken(req.params.token);
  if (!entry) {
    return res.status(404).json({ message: 'Rapport introuvable ou expiré.' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${entry.filename.replace(/"/g, '')}"`
  );
  res.setHeader('Content-Length', String(entry.buffer.length));
  return res.send(entry.buffer);
};
