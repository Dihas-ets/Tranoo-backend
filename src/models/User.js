// const mongoose = require('mongoose');

// // Schéma User unique pour tous les rôles (mobile et web)
// const userSchema = new mongoose.Schema({
//   uid: { type: String, required: true, unique: true }, // UID Firebase
//   nom: { type: String, required: true }, // Nom de famille
//   prenoms: { type: String, required: true }, // Prénoms
//   email: { type: String, required: true, unique: true }, // Email
//   telephone: { type: String, required: true }, // Numéro de téléphone
//   pays: { type: String }, // Pays de résidence (mobile)
//   maison: { type: String }, // Maison (mobile)
//   entreprise: { type: String }, // Nom de l'entreprise (pour transitaire)
//   // Champs spécifiques vendeur
//   registreCommerce: { type: String }, // Numéro du registre de commerce
//   numeroIFU: { type: String }, // Numéro IFU
//   entrepriseProvenance: { type: String }, // Entreprise de provenance
//   // Champs spécifiques chauffeur
//   pieceIdentite: {
//     type: {
//       type: String, // CNI, Passeport, etc.
//       default: null
//     },
//     numero: { type: String, default: null },
//     urlRecto: { type: String, default: null },
//     urlVerso: { type: String, default: null }
//   },
//   permis: {
//     numero: { type: String, default: null },
//     urlRecto: { type: String, default: null },
//     urlVerso: { type: String, default: null },
//     dateValidite: { type: Date, default: null }
//   },
//   entrepriseAssociee: {
//     nom: { type: String, default: null },
//     adresse: { type: String, default: null },
//     telephone: { type: String, default: null }
//   },
//   garant: {
//     nom: { type: String, default: null },
//     prenom: { type: String, default: null },
//     numero: { type: String, default: null },
//     relation: { type: String, default: null }
//   },
//   informationsCapitales: {
//     nom: { type: String, default: null },
//     prenom: { type: String, default: null },
//     numero: { type: String, default: null },
//     relation: { type: String, default: null }
//   },
//   // Champs spécifiques livreur/chauffeur - Informations véhicule
//   vehicule: {
//     immatriculation: { type: String, default: null }, // Numéro d'immatriculation
//     type: { type: String, default: null }, // Type: Moto, Voiture, Camion, etc.
//     marque: { type: String, default: null }, // Marque du véhicule
//     modele: { type: String, default: null }, // Modèle du véhicule
//     annee: { type: Number, default: null }, // Année de fabrication
//     couleur: { type: String, default: null }, // Couleur principale
//     urlPhoto: { type: String, default: null }, // Photo du véhicule
//   },
//   // Champs spécifiques pour les admins (web)
//   adresse: { type: String }, // Adresse (admin)
//   ville: { type: String }, // Ville (admin)
//   photo: { type: String }, // URL de la photo de profil
//   password: { type: String }, // Mot de passe hashé
//   typeAdmin: { 
//     type: String, 
//     enum: [
//       'superAdmin', 'principal', 'moderateur', 'gestionnaire', 
//       'responsablePaiement', 'responsableService', 'responsablePartenaires', 
//       'analyste', 'marketing', null
//     ],
//     default: null
//   }, // Type d'admin (si role = admin)
//   statut: { type: String, enum: ['actif', 'inactif'], default: 'actif' }, // Statut du compte
//   isBlocked: { type: Boolean, default: false }, // Utilisateur bloqué par admin
//   blockedAt: { type: Date }, // Date de blocage
//   blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Admin qui a bloqué
//   langue: { type: String, default: 'fr' }, // Langue préférée
//   devise: { type: String, default: 'XOF' }, // Devise préférée
//   dateInscription: { type: Date, default: Date.now }, // Date d'inscription
//   dernierAcces: { type: Date }, // Dernière connexion
//   fcmToken: { type: String, default: null }, // Token FCM pour notifications push
//   role: { 
//     type: String, 
//     enum: ['vendeur', 'acheteur', 'transitaire', 'admin', 'chauffeur', 'livreur', 'agentCommercial'], 
//     required: true 
//   }, // Rôle principal
//   statutContrat: {
//     type: String,
//     enum: ['CDD', 'CDI', 'En mission', null],
//     default: null
//   },
//   // Favoris d'articles (voitures/pieces) liés à l'utilisateur
//   favoris: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Article' }],
//   // NOUVEAUX CHAMPS POUR LE STATUT EN LIGNE
//   isOnline: { type: Boolean, default: false }, // Statut en ligne/hors ligne
//   lastSeen: { type: Date, default: Date.now }, // Dernière activité
//   // CHAMP POUR LE PARRAINAGE
//   referralCode: { type: String, unique: true, sparse: true }, // Code de parrainage unique
//   referralStats: {
//     totalReferred: { type: Number, default: 0 },
//     referredUserIds: {
//       type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
//       default: []
//     }
//   },
//   // Attribution du tarif de parrainage (pour agents commerciaux)
//   assignedReferralTariff: { type: mongoose.Schema.Types.ObjectId, ref: 'ReferralTariff', default: null },

//   // ==========================
//   // GEOLOCALISATION (Tricycle / Tracking)
//   // ==========================
//   // Format GeoJSON Point: [longitude, latitude]
//   location: {
//     type: {
//       type: String,
//       enum: ['Point'],
//     },
//     // On ne met pas de valeur par défaut ici :
//     // le champ "location" sera complètement absent tant qu'on n'aura pas de coordonnées.
//     coordinates: { type: [Number], default: undefined },
//   },
//   lastLocationAt: { type: Date, default: null },

//   // Statut de disponibilité (principalement pour role=chauffeur)
//   availabilityStatus: {
//     type: String,
//     enum: ['available', 'busy', 'offline'],
//     default: 'offline',
//   },
// });

// // Index utile sur le téléphone pour OTP
// userSchema.index({ telephone: 1 });
// // Index géospatial (tricycle / tracking)
// userSchema.index({ location: '2dsphere' });

// // Sécuriser le champ de géolocalisation : si les coordonnées sont invalides
// // (ou absentes), on supprime complètement "location" pour éviter l'erreur
// // "Can't extract geo keys: ... Point must be an array or object".
// userSchema.pre('save', function (next) {
//   if (this.location) {
//     const coords = this.location.coordinates;
//     const isValidPoint =
//       this.location.type === 'Point' &&
//       Array.isArray(coords) &&
//       coords.length === 2 &&
//       typeof coords[0] === 'number' &&
//       typeof coords[1] === 'number';

//     if (!isValidPoint) {
//       this.location = undefined;
//     }
//   }
//   next();
// });

// module.exports = mongoose.model('User', userSchema); 




const mongoose = require('mongoose');

// Schéma User unique pour tous les rôles (mobile et web)
const userSchema = new mongoose.Schema({
  uid: { type: String, required: true, unique: true }, // UID Firebase
  nom: { type: String, required: true }, // Nom de famille
  prenoms: { type: String, required: true }, // Prénoms
  email: { type: String, required: true, unique: true }, // Email obligatoire
  // Téléphone:
  // - obligatoire pour les rôles "mobiles" (acheteur, vendeur, livreur, chauffeur, transitaire, agentCommercial)
  // - facultatif pour les admins web (role === 'admin') afin de ne pas bloquer la création depuis le dashboard
  telephone: {
    type: String,
    required: function () {
      const r = this.role;
      if (!r) return false;
      return ['vendeur', 'acheteur', 'transitaire', 'chauffeur', 'livreur', 'agentCommercial'].includes(r);
    },
    trim: true,
  },
  /** Chiffres E.164 canoniques (ex. 22959399349) — unicité avec authApp. */
  telephoneCanonical: {
    type: String,
    trim: true,
    default: null,
  },
  /** Application mobile liée au compte : tranoo (acheteur) ou tranoo_pro (vendeur, livreur, …). */
  authApp: {
    type: String,
    enum: ['tranoo', 'tranoo_pro', null],
    default: null,
  },
  pays: { type: String },
  maison: { type: String },
  entreprise: { type: String },
  registreCommerce: { type: String },
  numeroIFU: { type: String },
  entrepriseProvenance: { type: String },
  fournisseurProfil: {
    telephone: { type: String, default: null },
    adresseTexte: { type: String, default: null },
    ville: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
  },
  pieceIdentite: {
    type: {
      type: String,
      default: null,
    },
    numero: { type: String, default: null },
    urlRecto: { type: String, default: null },
    urlVerso: { type: String, default: null },
  },
  permis: {
    numero: { type: String, default: null },
    urlRecto: { type: String, default: null },
    urlVerso: { type: String, default: null },
    dateValidite: { type: Date, default: null },
  },
  entrepriseAssociee: {
    nom: { type: String, default: null },
    adresse: { type: String, default: null },
    telephone: { type: String, default: null },
  },
  garant: {
    nom: { type: String, default: null },
    prenom: { type: String, default: null },
    numero: { type: String, default: null },
    relation: { type: String, default: null },
  },
  informationsCapitales: {
    nom: { type: String, default: null },
    prenom: { type: String, default: null },
    numero: { type: String, default: null },
    relation: { type: String, default: null },
  },
  vehicule: {
    immatriculation: { type: String, default: null },
    type: { type: String, default: null },
    marque: { type: String, default: null },
    modele: { type: String, default: null },
    annee: { type: Number, default: null },
    couleur: { type: String, default: null },
    urlPhoto: { type: String, default: null },
  },
  adresse: { type: String },
  ville: { type: String },
  photo: { type: String },
  password: { type: String },
  typeAdmin: {
    type: String,
    enum: [
      'superAdmin',
      'principal',
      'moderateur',
      'gestionnaire',
      'responsablePaiement',
      'responsableService',
      'responsablePartenaires',
      'analyste',
      'marketing',
      null,
    ],
    default: null,
  },
  statut: { type: String, enum: ['actif', 'inactif'], default: 'actif' },
  isBlocked: { type: Boolean, default: false },
  blockedAt: { type: Date },
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  langue: { type: String, default: 'fr' },
  devise: { type: String, default: 'XOF' },
  dateInscription: { type: Date, default: Date.now },
  dernierAcces: { type: Date },
  fcmToken: { type: String, default: null },
  role: {
    type: String,
    enum: ['vendeur', 'acheteur', 'transitaire', 'admin', 'chauffeur', 'livreur', 'agentCommercial'],
    required: true,
  },
  // Type de vendeur (Tranoo Pro) — ne remplace pas "role"
  // null => compatibilité anciens vendeurs (considérés comme mixte)
  vendeurType: {
    type: String,
    enum: ['mixte', 'vehicules', 'pieces', null],
    default: null,
  },
  statutContrat: {
    type: String,
    enum: ['CDD', 'CDI', 'En mission', null],
    default: null,
  },
  typeAgent: {
    type: String,
    enum: ['Tranoo', 'Tranoo_pro', null],
    default: null,
  },
  dureeContratMois: {
    type: Number,
    min: 1,
    default: null,
  },
  mobileCredentials: {
    login: { type: String, default: null },
    password: { type: String, default: null },
  },
  // Pour les agents Tranoo_pro: compte "acheteur" lié sur l'app Tranoo (identifiants dédiés)
  tranooBuyerCredentials: {
    login: { type: String, default: null },
    password: { type: String, default: null },
  },
  proVendorAccount: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uid: { type: String, default: null },
    email: { type: String, default: null },
  },
  tranooBuyerAccount: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uid: { type: String, default: null },
    email: { type: String, default: null },
  },
  webSession: {
    sessionId: { type: String, default: null },
    lastActivityAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
    clientInfo: { type: String, default: null },
  },
  authMeta: {
    lastAuthTime: { type: Number, default: null }, // dernier auth_time Firebase (seconds)
    lastAuthEventAt: { type: Date, default: null },
  },
  favoris: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Article' }],
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
  referralCode: { type: String, unique: true, sparse: true }, // sparse pour autoriser null
  referralStats: {
    totalReferred: { type: Number, default: 0 },
    referredUserIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
  },
  assignedReferralTariff: { type: mongoose.Schema.Types.ObjectId, ref: 'ReferralTariff', default: null },
  location: {
    type: { type: String, enum: ['Point'] },
    coordinates: { type: [Number], default: undefined },
  },
  lastLocationAt: { type: Date, default: null },
  availabilityStatus: {
    type: String,
    enum: ['available', 'busy', 'offline'],
    default: 'offline',
  },
});

// Index utiles
userSchema.index({ telephone: 1 });
userSchema.index(
  { telephoneCanonical: 1, authApp: 1 },
  { unique: true, sparse: true }
);
userSchema.index({ location: '2dsphere' });

const {
  canonicalPhoneDigits,
  internationalPhoneFromDigits,
} = require('../utils/phoneNormalize');
const { authAppFromRole } = require('../utils/authAppRoles');

// Pré-save : normaliser téléphone + authApp
userSchema.pre('save', function (next) {
  if (this.telephone) {
    const canon = canonicalPhoneDigits({ telephone: this.telephone });
    if (canon && canon.length >= 8 && !/^0+$/.test(canon)) {
      this.telephoneCanonical = canon;
      this.telephone = internationalPhoneFromDigits(canon);
    }
  }
  if (!this.authApp && this.role) {
    this.authApp = authAppFromRole(this.role);
  }

  if (this.location) {
    const coords = this.location.coordinates;
    const isValidPoint =
      this.location.type === 'Point' &&
      Array.isArray(coords) &&
      coords.length === 2 &&
      typeof coords[0] === 'number' &&
      typeof coords[1] === 'number';

    if (!isValidPoint) {
      this.location = undefined;
    }
  }
  next();
});

module.exports = mongoose.model('User', userSchema);