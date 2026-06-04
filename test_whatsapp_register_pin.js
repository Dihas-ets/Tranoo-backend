/**
 * Enregistrement du numéro WhatsApp Business (une fois par numéro).
 * Utilise VERIFY_PIN du .env (6 chiffres).
 *
 * Usage : node test_whatsapp_register_pin.js
 */
require('dotenv').config();

const axios = require('axios');
const waConfig = require('./src/config/whatsappConfig');

async function main() {
  const token = waConfig.TOKEN;
  const phoneId = waConfig.PHONE_NUMBER_ID;
  const pin = process.env.VERIFY_PIN || '123456';

  if (!token || !phoneId) {
    console.error('Configurez WHATSAPP_TOKEN et PHONE_NUMBER_ID dans .env');
    process.exit(1);
  }

  try {
    const response = await axios.post(
      `https://graph.facebook.com/${waConfig.GRAPH_API_VERSION}/${phoneId}/register`,
      {
        messaging_product: 'whatsapp',
        pin: String(pin),
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('PIN enregistré avec succès');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error(JSON.stringify(error.response?.data || error.message, null, 2));
    process.exit(1);
  }
}

main();
