const axios = require('axios');

const BASE_URL = 'http://localhost:5000/api';

// Token de test (remplacez par un vrai token)
const TEST_TOKEN = 'your-test-token-here';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${TEST_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

async function testRoutes() {
  console.log('🧪 Test des routes du dashboard...\n');

  const routes = [
    { name: 'Stats générales', url: '/protected/stats' },
    { name: 'Stats acheteurs', url: '/protected/stats/acheteurs' },
    { name: 'Tous les vendeurs', url: '/users/vendeurs/all' },
    { name: 'Tous les acheteurs', url: '/users/acheteurs/all' },
    { name: 'Tous les transitaires', url: '/users/transitaires/all' },
    { name: 'Tous les chauffeurs', url: '/users/chauffeurs/all' },
    { name: 'Tous les admins', url: '/users/admins/all' },
    { name: 'Demandes chauffeurs', url: '/chauffeurs/demandes' },
  ];

  for (const route of routes) {
    try {
      console.log(`📡 Test: ${route.name}`);
      const response = await api.get(route.url);
      console.log(`✅ ${route.name}: ${response.status} - ${Array.isArray(response.data) ? response.data.length + ' éléments' : 'Objet'}`);
    } catch (error) {
      console.log(`❌ ${route.name}: ${error.response?.status || 'Erreur'} - ${error.response?.data?.message || error.message}`);
    }
    console.log('');
  }
}

// Exécuter les tests seulement si ce fichier est exécuté directement
if (require.main === module) {
  testRoutes().catch(console.error);
}

module.exports = { testRoutes };