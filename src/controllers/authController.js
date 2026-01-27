const admin = require('firebase-admin');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { createReferralRecord, ReferralCreationError } = require('./referralController');
// In-memory OTP store (replace with Redis/DB in production)

// Contrôleur pour l'inscription d'un utilisateur (mobile ou admin)
exports.register = async (req, res) => {
  try {
    const {
      nom,
      prenoms,
      email,
      telephone,
      role,
      pays,
      maison,
      entreprise,
      registreCommerce,
      numeroIFU,
      entrepriseProvenance,
      adresse,
      ville,
      photo,
      typeAdmin,
      statutContrat,
      password,
      referralCode, // Code de parrainage optionnel
      vehicule // Objet véhicule (livreur/chauffeur)
    } = req.body;

    // Cas spécial : création d'admin ou agent commercial via dashboard (avec mot de passe)
    if ((role === 'admin' || role === 'agentCommercial') && password) {
      console.log('[REGISTER] ===== DÉBUT INSCRIPTION ADMIN/AGENT =====');
      console.log('[REGISTER] Email:', email);
      console.log('[REGISTER] Role:', role);
      console.log('[REGISTER] Nom:', nom, 'Prénoms:', prenoms);
      
      // Vérifier si l'email existe déjà dans MongoDB
      console.log('[REGISTER] Vérification existence dans MongoDB...');
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        console.error('[REGISTER] ❌ Email déjà existant dans MongoDB:', email);
        return res.status(400).json({ message: 'Un utilisateur avec cet email existe déjà' });
      }
      console.log('[REGISTER] ✅ Email non trouvé dans MongoDB, on peut continuer');

      // Vérifier si l'email existe déjà dans Firebase
      console.log('[REGISTER] Vérification existence dans Firebase...');
      try {
        const existingFirebaseUser = await admin.auth().getUserByEmail(email);
        console.error('[REGISTER] ❌ Email déjà existant dans Firebase:', existingFirebaseUser.uid);
        return res.status(400).json({ message: 'Un utilisateur avec cet email existe déjà dans Firebase' });
      } catch (firebaseError) {
        // Si l'erreur est "user-not-found", c'est normal, on peut créer
        if (firebaseError.code !== 'auth/user-not-found') {
          console.error('[REGISTER] ❌ Erreur lors de la vérification Firebase:', firebaseError);
          throw firebaseError;
        }
        console.log('[REGISTER] ✅ Email non trouvé dans Firebase, on peut créer');
      }

      // Créer l'utilisateur dans Firebase Auth
      console.log('[REGISTER] Création utilisateur dans Firebase...');
      let firebaseUser;
      try {
        firebaseUser = await admin.auth().createUser({
        email,
        password,
        displayName: `${prenoms} ${nom}`
      });
        console.log('[REGISTER] ✅ Utilisateur Firebase créé avec succès');
        console.log('[REGISTER] Firebase UID:', firebaseUser.uid);
      } catch (firebaseError) {
        console.error('[REGISTER] ❌ Erreur lors de la création Firebase:', firebaseError.message);
        console.error('[REGISTER] Détails erreur Firebase:', firebaseError);
        return res.status(400).json({ 
          message: 'Erreur lors de la création dans Firebase', 
          error: firebaseError.message 
        });
      }

      // Hasher le mot de passe pour MongoDB
      console.log('[REGISTER] Hashage du mot de passe pour MongoDB...');
      const hashedPassword = await bcrypt.hash(password, 10);
      console.log('[REGISTER] ✅ Mot de passe hashé');

      // Créer l'utilisateur dans MongoDB
      console.log('[REGISTER] Création objet utilisateur MongoDB...');
      const user = new User({
        uid: firebaseUser.uid,
        nom,
        prenoms,
        email,
        telephone,
        role,
        adresse,
        ville,
        photo,
        typeAdmin,
        // Ajouter les données véhicule si présentes (livreur/chauffeur)
        vehicule: vehicule && typeof vehicule === 'object' ? {
          immatriculation: vehicule.immatriculation || null,
          type: vehicule.type || null,
          marque: vehicule.marque || null,
          modele: vehicule.modele || null,
          annee: vehicule.annee ? parseInt(vehicule.annee) : null,
          couleur: vehicule.couleur || null,
          urlPhoto: vehicule.urlPhoto || null,
        } : undefined,
        statutContrat,
        password: hashedPassword,
        statut: 'actif',
        dateInscription: new Date(),
      });

      // Pour les agents commerciaux : générer le code de parrainage et sauvegarder assignedReferralTariff
      if (role === 'agentCommercial') {
        console.log('[REGISTER] Configuration agent commercial...');
        user.assignedReferralTariff = req.body.assignedReferralTariff || null;
        console.log('[REGISTER] assignedReferralTariff:', user.assignedReferralTariff);
        
        // Générer un code de parrainage unique
        const generateReferralCode = () => crypto.randomBytes(4).toString('hex').toUpperCase();
        let code = generateReferralCode();
        while (await User.findOne({ referralCode: code })) {
          code = generateReferralCode();
        }
        user.referralCode = code;
        console.log('[REGISTER] ✅ Code de parrainage généré:', code);
      }

      // Sauvegarder dans MongoDB
      console.log('[REGISTER] Sauvegarde dans MongoDB...');
      try {
      await user.save();
        console.log('[REGISTER] ✅ Utilisateur MongoDB sauvegardé avec succès');
        console.log('[REGISTER] MongoDB _id:', user._id);
        console.log('[REGISTER] ===== INSCRIPTION RÉUSSIE =====');
        return res.status(201).json({ 
          message: role === 'admin' ? 'Administrateur créé avec succès' : 'Agent commercial créé avec succès', 
          user, 
          _id: user._id 
        });
      } catch (saveError) {
        console.error('[REGISTER] ❌ Erreur sauvegarde MongoDB:', saveError.message);
        console.error('[REGISTER] Détails erreur MongoDB:', saveError);
        // Si la sauvegarde MongoDB échoue, supprimer l'utilisateur Firebase pour éviter les incohérences
        console.log('[REGISTER] Nettoyage: suppression utilisateur Firebase...');
        try {
          await admin.auth().deleteUser(firebaseUser.uid);
          console.log('[REGISTER] ✅ Utilisateur Firebase supprimé après échec MongoDB');
        } catch (deleteError) {
          console.error('[REGISTER] ❌ Erreur lors de la suppression Firebase:', deleteError.message);
        }
        throw saveError; // Re-lancer l'erreur pour qu'elle soit gérée par le catch global
      }
    }

    // Cas normal : utilisateurs mobiles avec token Firebase
    console.log('[REGISTER] ===== DÉBUT INSCRIPTION MOBILE =====');
    console.log('[REGISTER] Email:', email);
    console.log('[REGISTER] Role:', role);
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[REGISTER] ❌ Token manquant ou invalide');
      return res.status(401).json({ message: 'Token manquant ou invalide' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    console.log('[REGISTER] Token Firebase reçu, vérification...');

    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
      console.log('[REGISTER] ✅ Token Firebase vérifié');
      console.log('[REGISTER] Firebase UID:', decodedToken.uid);
    } catch (tokenError) {
      console.error('[REGISTER] ❌ Erreur vérification token:', tokenError.message);
      return res.status(401).json({ message: 'Token invalide', error: tokenError.message });
    }
    
    const uid = decodedToken.uid;
    const userEmail = decodedToken.email;
    console.log('[REGISTER] Email depuis token:', userEmail);

    console.log('[REGISTER] Recherche utilisateur dans MongoDB avec UID:', uid);
    let user = await User.findOne({ uid });
    if (user) {
      console.log('[REGISTER] ✅ Utilisateur déjà enregistré dans MongoDB');
      console.log('[REGISTER] MongoDB _id:', user._id);
      return res.status(200).json({ message: 'Utilisateur déjà enregistré', user });
    }
    console.log('[REGISTER] Utilisateur non trouvé, création...');

    console.log('[REGISTER] Création objet utilisateur MongoDB...');
    user = new User({
      uid,
      nom,
      prenoms,
      email: userEmail,
      telephone,
      role,
      pays,
      maison,
      entreprise,
      registreCommerce,
      numeroIFU,
      entrepriseProvenance,
      adresse,
      ville,
      photo,
      typeAdmin,
      statutContrat,
      statut: 'actif',
      dateInscription: new Date(),
      // Ajouter les données véhicule si présentes (livreur/chauffeur)
      vehicule: vehicule && typeof vehicule === 'object' ? {
        immatriculation: vehicule.immatriculation || null,
        type: vehicule.type || null,
        marque: vehicule.marque || null,
        modele: vehicule.modele || null,
        annee: vehicule.annee ? parseInt(vehicule.annee) : null,
        couleur: vehicule.couleur || null,
        urlPhoto: vehicule.urlPhoto || null,
      } : undefined,
    });

    console.log('[REGISTER] Sauvegarde initiale dans MongoDB...');
    try {
    await user.save();
      console.log('[REGISTER] ✅ Utilisateur MongoDB sauvegardé');
      console.log('[REGISTER] MongoDB _id:', user._id);
    } catch (saveError) {
      console.error('[REGISTER] ❌ Erreur sauvegarde MongoDB:', saveError.message);
      console.error('[REGISTER] Détails erreur:', saveError);
      throw saveError;
    }
    
    // Générer un code de parrainage pour le nouvel utilisateur
    console.log('[REGISTER] Génération code de parrainage...');
    const generateReferralCode = () => {
      return crypto.randomBytes(4).toString('hex').toUpperCase();
    };
    
    // Assigner un code de parrainage unique au nouvel utilisateur
    let userReferralCode = generateReferralCode();
    while (await User.findOne({ referralCode: userReferralCode })) {
      userReferralCode = generateReferralCode();
    }
    user.referralCode = userReferralCode;
    console.log('[REGISTER] Code de parrainage généré:', userReferralCode);
    
    console.log('[REGISTER] Sauvegarde code de parrainage...');
    try {
    await user.save();
      console.log('[REGISTER] ✅ Code de parrainage sauvegardé');
    } catch (saveError) {
      console.error('[REGISTER] ❌ Erreur sauvegarde code parrainage:', saveError.message);
    }
    
    let referralSummary = null;
    let referralErrorMessage = null;
    
    // Traiter le parrainage si un code est fourni
    if (referralCode) {
      console.log('[REGISTER] Traitement parrainage avec code:', referralCode);
      try {
        const { referral, status, rewardAmount, isAgent } = await createReferralRecord({
          referralCode,
          referredUser: user,
        });
        referralSummary = {
          referralId: referral._id,
          status,
          rewardAmount,
          isAgent,
        };
        console.log('[REGISTER] ✅ Parrainage créé avec succès');
      } catch (referralError) {
        if (referralError instanceof ReferralCreationError) {
          referralErrorMessage = referralError.message;
        } else {
          referralErrorMessage = 'Erreur lors de la création du parrainage';
        }
        console.error('[REGISTER] ❌ Erreur parrainage:', referralErrorMessage);
        // Ne pas faire échouer l'inscription si le parrainage échoue
      }
    } else {
      console.log('[REGISTER] Aucun code de parrainage fourni');
    }
    
    console.log('[REGISTER] ===== INSCRIPTION MOBILE RÉUSSIE =====');
    return res.status(201).json({
      message: 'Utilisateur enregistré',
      user,
      referral: referralSummary,
      referralError: referralErrorMessage,
    });
  } catch (error) {
    console.error('[REGISTER] ===== ERREUR INSCRIPTION =====');
    console.error('[REGISTER] Type erreur:', error.name);
    console.error('[REGISTER] Message erreur:', error.message);
    console.error('[REGISTER] Stack trace:', error.stack);
    return res.status(500).json({ message: 'Erreur lors de l\'inscription', error: error.message });
  }
}; 

// Ancien système WhatsApp OTP supprimé - Remplacé par Push Notifications