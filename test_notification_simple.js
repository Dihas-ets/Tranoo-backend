const http = require('http');

// Script de test simple pour envoyer une notification
function testNotification() {
  const data = JSON.stringify({
    recipientId: '686d4db2b133302db8cb98c6', // ID du vendeur de test
    senderId: '686d4db2b133302db8cb98c6', // Même ID pour éviter les erreurs
    title: 'Test Notification',
    message: 'Ceci est une notification de test pour vérifier le système',
    type: 'chat'
  });

  console.log('Données envoyées:', data);

  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/notifications/test',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  console.log('Options de requête:', options);

  const req = http.request(options, (res) => {
    console.log('Status Code:', res.statusCode);
    console.log('Headers:', res.headers);
    
    let responseData = '';
    
    res.on('data', (chunk) => {
      responseData += chunk;
      console.log('Chunk reçu:', chunk.toString());
    });
    
    res.on('end', () => {
      console.log('Réponse complète du serveur:', responseData);
      try {
        const result = JSON.parse(responseData);
        if (res.statusCode === 200) {
          console.log('✅ Notification de test envoyée avec succès:', result);
        } else {
          console.log('❌ Erreur:', result);
        }
      } catch (e) {
        console.log('❌ Réponse non-JSON:', responseData);
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Erreur lors de l\'envoi de la notification de test:', error.message);
  });

  req.on('timeout', () => {
    console.error('❌ Timeout de la requête');
    req.destroy();
  });

  req.setTimeout(10000); // 10 secondes de timeout

  console.log('Envoi de la requête...');
  req.write(data);
  req.end();
}

console.log('🚀 Démarrage du test de notification...');
testNotification();
