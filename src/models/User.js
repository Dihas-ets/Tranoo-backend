const mongoose = require('mongoose');

// Schéma User unique pour tous les rôles (mobile et web)
const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true }, // UID Firebase
  nom: { type: String, required: true }, // Nom de famille
  prenoms: { type: String, required: true }, // Prénoms
  email: { type: String, required: true, unique: true }, // Email
  telephone: { type: String, required: true }, // Numéro de téléphone
  pays: { type: String }, // Pays de résidence (mobile)
  maison: { type: String }, // Maison (mobile)
  entreprise: { type: String }, // Nom de l'entreprise (pour transitaire)
  // Champs spécifiques vendeur
  registreCommerce: { type: String }, // Numéro du registre de commerce
  numeroIFU: { type: String }, // Numéro IFU
  entrepriseProvenance: { type: String }, // Entreprise de provenance
  // Champs spécifiques chauffeur
  pieceIdentite: {
    type: {
      type: String, // CNI, Passeport, etc.
      default: null
    },
    numero: { type: String, default: null },
    urlRecto: { type: String, default: null },
    urlVerso: { type: String, default: null }
  },
  permis: {
    numero: { type: String, default: null },
    urlRecto: { type: String, default: null },
    urlVerso: { type: String, default: null },
    dateValidite: { type: Date, default: null }
  },
  entrepriseAssociee: {
    nom: { type: String, default: null },
    adresse: { type: String, default: null },
    telephone: { type: String, default: null }
  },
  garant: {
    nom: { type: String, default: null },
    prenom: { type: String, default: null },
    numero: { type: String, default: null },
    relation: { type: String, default: null }
  },
  informationsCapitales: {
    nom: { type: String, default: null },
    prenom: { type: String, default: null },
    numero: { type: String, default: null },
    relation: { type: String, default: null }
  },
  // Champs spécifiques pour les admins (web)
  adresse: { type: String }, // Adresse (admin)
  ville: { type: String }, // Ville (admin)
  photo: { type: String }, // URL de la photo de profil
  password: { type: String }, // Mot de passe hashé
  typeAdmin: { 
    type: String, 
    enum: [
      'superAdmin', 'principal', 'moderateur', 'gestionnaire', 
      'responsablePaiement', 'responsableService', 'responsablePartenaires', 
      'analyste', 'marketing', null
    ],
    default: null
  }, // Type d'admin (si role = admin)
  statut: { type: String, enum: ['actif', 'inactif'], default: 'actif' }, // Statut du compte
  isBlocked: { type: Boolean, default: false }, // Utilisateur bloqué par admin
  blockedAt: { type: Date }, // Date de blocage
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Admin qui a bloqué
  langue: { type: String, default: 'fr' }, // Langue préférée
  devise: { type: String, default: 'XOF' }, // Devise préférée
  dateInscription: { type: Date, default: Date.now }, // Date d'inscription
  dernierAcces: { type: Date }, // Dernière connexion
  fcmToken: { type: String, default: null }, // Token FCM pour notifications push
  role: { 
    type: String, 
    enum: ['vendeur', 'acheteur', 'transitaire', 'admin', 'chauffeur'], 
    required: true 
  }, // Rôle principal
  statutContrat: {
    type: String,
    enum: ['CDD', 'CDI', 'En mission', null],
    default: null
  },
  // Favoris d'articles (voitures/pieces) liés à l'utilisateur
  favoris: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Article' }],
  // NOUVEAUX CHAMPS POUR LE STATUT EN LIGNE
  isOnline: { type: Boolean, default: false }, // Statut en ligne/hors ligne
  lastSeen: { type: Date, default: Date.now }, // Dernière activité
  // CHAMP POUR LE PARRAINAGE
  referralCode: { type: String, unique: true, sparse: true } // Code de parrainage unique
});

// Index utile sur le téléphone pour OTP
userSchema.index({ telephone: 1 });

module.exports = mongoose.model('User', userSchema); 