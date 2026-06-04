require('dotenv').config();
const axios = require('axios');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const publicId = process.argv[2] || 'tranoo/verification/documents/test-tranoo_vgxdo7.pdf';

async function main() {
  const res = await cloudinary.api.resource(publicId, { resource_type: 'raw' });
  console.log('resource', { access_mode: res.access_mode, url: res.secure_url, bytes: res.bytes });

  const urls = [
    res.secure_url,
    cloudinary.url(publicId, { resource_type: 'raw', secure: true, sign_url: true }),
  ];

  for (const url of urls) {
    const r = await axios.get(url, { validateStatus: () => true, maxRedirects: 5 });
    console.log('GET', url.slice(0, 80), '→', r.status, r.headers['content-type']);
  }

  const auth = {
    username: process.env.CLOUDINARY_API_KEY,
    password: process.env.CLOUDINARY_API_SECRET,
  };
  const adminUrl = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/raw/download`;
  const r2 = await axios.get(adminUrl, {
    auth,
    params: { public_id: publicId },
    validateStatus: () => true,
    responseType: 'arraybuffer',
    maxContentLength: 5000000,
  });
  console.log('admin raw/download', r2.status, r2.headers['content-type'], 'bytes', r2.data?.byteLength);
}

main().catch((e) => console.error(e.response?.data || e.message));
