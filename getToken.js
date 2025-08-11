// Script Node.js pour obtenir un ID Token Firebase à partir d'un email/mot de passe
// et l'utiliser pour tester l'authentification de ton backend

// 1. On importe les fonctions nécessaires du SDK Firebase
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword } = require('firebase/auth');

// 2. On configure Firebase avec les infos de ton projet (copie depuis la console Firebase)
const firebaseConfig = {
  apiKey: 'AIzaSyB5rzuZ429Fo-QN1sMbOuH_KHS4xlUP2R0', // Remplace par ta clé API
  authDomain: 'tranoo.firebaseapp.com', // Remplace par ton domaine d'auth
  projectId: 'tranoo', // Remplace par l'ID de ton projet
  // ... ajoute les autres champs si besoin (storageBucket, messagingSenderId, appId)
};

// 3. On initialise l'application Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// 4. On définit l'email et le mot de passe de l'utilisateur de test
// const email = 'gnacadjalaurinda@gmail.com'; // Remplace par l'email de ton utilisateur
// const password = '2162LeoLaure#2021'; // Remplace par le mot de passe

const email = 'gm@gmail.com'; // Remplace par l'email de ton utilisateur
const password = 'Azertyuiop26#'; // Remplace par le mot de passe

// 5. On se connecte à Firebase Auth et on récupère l'ID Token
signInWithEmailAndPassword(auth, email, password)
  .then(async (userCredential) => {
    // Si la connexion réussit, on récupère le token
    const token = await userCredential.user.getIdToken();
    console.log('ID Token Firebase :', token);
    // Tu peux maintenant utiliser ce token pour tester ton backend (ex: avec Postman)
  })
  .catch((error) => {
    // Si la connexion échoue, on affiche l'erreur
    console.error("Erreur d'authentification :", error);
  }); 