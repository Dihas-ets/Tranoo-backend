const path = require('path');
const fs = require('fs');

// Charger les données complètes des départements du Bénin
const beninData = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/benin-departements-complet.json'), 'utf8'));

// Controller pour les données géographiques du Bénin
const geoBeninController = {
  // Récupérer tous les départements
  getDepartements: (req, res) => {
    try {
      const departements = beninData.departements.map(dep => ({
        nom: dep.nom,
        code: dep.code,
        chef_lieu: dep.chef_lieu
      }));
      
      res.json(departements);
    } catch (error) {
      console.error('Erreur lors de la récupération des départements:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  // Récupérer les communes d'un département
  getCommunesByDepartement: (req, res) => {
    try {
      const { departement } = req.params;
      
      const departementData = beninData.departements.find(dep => 
        dep.nom.toLowerCase() === departement.toLowerCase()
      );
      
      if (!departementData) {
        return res.status(404).json({ error: 'Département non trouvé' });
      }
      
      const communes = departementData.communes.map(commune => ({
        nom: commune.nom,
        arrondissements: commune.arrondissements
      }));
      
      res.json(communes);
    } catch (error) {
      console.error('Erreur lors de la récupération des communes:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  // Récupérer les arrondissements d'une commune
  getArrondissementsByCommune: (req, res) => {
    try {
      const { departement, commune } = req.params;
      
      const departementData = beninData.departements.find(dep => 
        dep.nom.toLowerCase() === departement.toLowerCase()
      );
      
      if (!departementData) {
        return res.status(404).json({ error: 'Département non trouvé' });
      }
      
      const communeData = departementData.communes.find(comm => 
        comm.nom.toLowerCase() === commune.toLowerCase()
      );
      
      if (!communeData) {
        return res.status(404).json({ error: 'Commune non trouvée' });
      }
      
      res.json(communeData.arrondissements);
    } catch (error) {
      console.error('Erreur lors de la récupération des arrondissements:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  // Récupérer toutes les données géographiques pour un département
  getFullGeoData: (req, res) => {
    try {
      const { departement } = req.params;
      
      const departementData = beninData.departements.find(dep => 
        dep.nom.toLowerCase() === departement.toLowerCase()
      );
      
      if (!departementData) {
        return res.status(404).json({ error: 'Département non trouvé' });
      }
      
      res.json(departementData);
    } catch (error) {
      console.error('Erreur lors de la récupération des données géographiques:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  },

  // Récupérer toutes les données géographiques du Bénin
  getAllGeoData: (req, res) => {
    try {
      res.json(beninData);
    } catch (error) {
      console.error('Erreur lors de la récupération des données complètes:', error);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
};

module.exports = geoBeninController;
