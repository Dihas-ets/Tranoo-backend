const axios = require('axios');

// Script de test pour envoyer une notification
async function testNotification() {
  try {
    // Remplacer par l'ID d'un utilisateur vendeur existant
    const vendeurId = '686d4db2b133302db8cb98c6'; // ID du vendeur de test
    const transitaireId = '6872623f18eb8a18d59b1069'; // ID du transitaire de test
    
    const response = await axios.post('http://localhost:5000/api/notifications/test', {
      recipientId: vendeurId,
      senderId: transitaireId,
      title: 'Test Notification',
      message: 'Ceci est une notification de test pour vérifier le système',
      type: 'chat'
    });
    
    console.log('Notification de test envoyée:', response.data);
  } catch (error) {
    console.error('Erreur lors de l\'envoi de la notification de test:', error.response?.data || error.message);
  }
}

testNotification();
