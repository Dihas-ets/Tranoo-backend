require('dotenv').config();
const axios = require('axios');
const { uploadVerificationPdfBuffer, resolvePublicPdfUrl } = require('../src/utils/cloudinaryPdf');

async function main() {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const result = await uploadVerificationPdfBuffer(pdf, 'test-proxy-tranoo.pdf');
  console.log('upload', result);

  const probe = await resolvePublicPdfUrl(result.pdfUrl);
  console.log('probe proxy', probe);

  const get = await axios.get(result.pdfUrl, { validateStatus: () => true });
  console.log('GET proxy', get.status, get.headers['content-type'], 'bytes', get.data?.length);
}

main().catch((e) => {
  console.error(e.code || e.message, e.probe || e.response?.data);
  process.exit(1);
});
