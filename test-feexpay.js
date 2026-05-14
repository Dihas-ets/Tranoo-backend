const axios = require('axios');

const FEEXPAY_V2 = process.env.FEEXPAY_BASE_URL || 'https://api-v2.feexpay.me';
const FEEXPAY_FEEXLINK = process.env.FEEXPAY_FEEXLINK_BASE_URL || 'https://api.feexpay.me';

async function testFeexPayIntegration() {
  const FEEXPAY_API_TOKEN = process.env.FEEXPAY_API_TOKEN;
  const FEEXPAY_SHOP_ID = process.env.FEEXPAY_SHOP_ID;
  
  console.log('=== TEST MANUEL FEEXPAY ===');
  console.log('Shop ID:', FEEXPAY_SHOP_ID);
  console.log('API Token:', FEEXPAY_API_TOKEN ? '✓ Présent' : '✗ Absent');
  
  if (!FEEXPAY_API_TOKEN || !FEEXPAY_SHOP_ID) {
    console.log('✗ Credentials manquants dans .env');
    return;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${FEEXPAY_API_TOKEN}`,
    'X-Shop-ID': FEEXPAY_SHOP_ID
  };

  try {
    console.log('\n1. Test création lien FeexLink...');
    const payload = {
      shop: FEEXPAY_SHOP_ID,
      amount: 100,
      description: 'Test manuel integration',
      paymentMethod: 'MOBILE',
      range: 1,
      expireIn: 5
    };

    const initResponse = await axios.post(
      `${FEEXPAY_FEEXLINK}/api/feexlink/api-create`,
      payload,
      { headers, timeout: 15000 }
    );
    
    console.log('✓ Succès création lien');
    console.log('Réponse:', JSON.stringify(initResponse.data, null, 2));

    let shortCode = null;
    if (initResponse.data.urlPay) {
      try {
        const url = new URL(initResponse.data.urlPay);
        const pathParts = url.pathname.split('/').filter(part => part);
        shortCode = pathParts[0];
        console.log('Code court extrait:', shortCode);
      } catch (e) {
        console.log('Impossible d\'extraire le code court:', e.message);
      }
    }

    if (shortCode) {
      console.log('\n2. Test liste des transactions pour trouver le vrai ID...');
      try {
        const listResponse = await axios.get(
          `${FEEXPAY_V2}/api/transactions?page=1&limit=50`,
          { headers, timeout: 15000 }
        );
        
        if (listResponse.data && listResponse.data.data) {
          console.log(`✓ ${listResponse.data.data.length} transactions récupérées`);
          
          // Chercher la transaction avec notre code court
          const transaction = listResponse.data.data.find(tx => 
            tx.short_code === shortCode || 
            tx.reference === shortCode ||
            (tx.payment_link && tx.payment_link.includes(shortCode))
          );
          
          if (transaction) {
            console.log('✅ Transaction trouvée:', JSON.stringify(transaction, null, 2));
            
            if (transaction.id) {
              console.log('\n3. Test statut avec le vrai transactionId:', transaction.id);
              try {
                const statusResponse = await axios.get(
                  `${FEEXPAY_V2}/api/transactions/public/single/status/${transaction.id}`,
                  {
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${FEEXPAY_API_TOKEN}`,
                    },
                    timeout: 10000,
                  },
                );
                
                console.log('✅ Statut récupéré avec succès');
                console.log('Statut:', JSON.stringify(statusResponse.data, null, 2));
              } catch (statusError) {
                console.log('❌ Erreur statut avec vrai ID:', statusError.response?.data || statusError.message);
              }
            }
          } else {
            console.log('❌ Aucune transaction trouvée avec le code court:', shortCode);
          }
        }
      } catch (listError) {
        console.log('❌ Erreur liste transactions:', listError.response?.data || listError.message);
      }
    }

  } catch (error) {
    console.log('❌ Erreur générale:', error.response?.data || error.message);
  }
}

// Exécuter le test si appelé directement
if (require.main === module) {
  require('dotenv').config();
  testFeexPayIntegration();
}

module.exports = testFeexPayIntegration;