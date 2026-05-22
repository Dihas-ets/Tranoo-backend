/**
 * server.js
 * 
 * Génère le code PIN de vérification pour enregistrer
 * un numéro WhatsApp Business via l'API Meta.
 * 
 * Installation :
 * npm init -y
 * npm install express axios dotenv
 * 
 * Lancement :
 * node server.js
 * 
 * Endpoint :
 * POST http://localhost:3000/request-pin
 */

require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

/**
 * Variables .env nécessaires :
 * 
 * ACCESS_TOKEN=TON_TOKEN_META
 * PHONE_NUMBER_ID=TON_PHONE_NUMBER_ID
 * VERIFY_PIN=123456
 * PORT=3000
 */

const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const VERIFY_PIN = process.env.VERIFY_PIN || "123456";
const PORT = process.env.PORT;

/**
 * Générer le code PIN pour enregistrer le numéro
 */
app.post("/request-pin", async (req, res) => {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/register`,
      {
        messaging_product: "whatsapp",
        pin: VERIFY_PIN,
      },
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.status(200).json({
      success: true,
      message: "PIN envoyé avec succès",
      pin_used: VERIFY_PIN,
      meta_response: response.data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error:
        error.response?.data ||
        error.message ||
        "Erreur inconnue",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});