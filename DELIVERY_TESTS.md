# Tests API Livraison (Tranoo Pro)

## Pré-requis
- Authentification avec un token valide (livreur / acheteur / admin).
- `applicationId` correct côté mobile (`tech.dihas.tramoo_pro`).
- Backend démarré (`/api/...`).

## Endpoints principaux

### 1) Créer une commande + livraison (acheteur)
- **POST** `/api/orders`
- Body (exemple pièces détachées) :
```json
{
  "items": [
    { "articleId": "ARTICLE_ID", "title": "Plaquette de frein", "quantity": 2, "unitPrice": 10000, "totalPrice": 20000 }
  ],
  "subtotal": 20000,
  "deliveryFee": 3000,
  "discount": 0,
  "total": 23000,
  "paymentMethod": "cash",
  "deliveryAddress": "Cotonou, Akpakpa",
  "deliveryNote": "Appeler avant de livrer",
  "isDeliveryRequired": true,
  "deliveryInfo": {
    "distanceKm": 12.5,
    "lieuDepart": { "adresse": "Magasin fournisseur, Cadjehoun" },
    "lieuDestination": { "adresse": "Cotonou, Akpakpa" },
    "fournisseur": { "nom": "Fournisseur X", "telephone": "+22990000000" }
  },
  "conditionsAffichee": true
}
```
- **Réponse attendue**: `201` avec `order.id`, `order.status` = `commandé`, et `deliveryId`.

### 2) Livraisons en attente (livreur)
- **GET** `/api/deliveries/pending`
- **Réponse**: liste des livraisons avec `statut = commandé` et `livreur = null`.

### 3) Détails d’une livraison
- **GET** `/api/deliveries/:id`
- **Réponse**: objet `delivery` avec infos acheteur, fournisseur, pièces, statut, etc.

### 4) Accepter une livraison (livreur)
- **POST** `/api/deliveries/:id/accept`
- **Réponse**: `success: true`, `delivery.statut = "assigné"`.

### 5) Refuser une livraison (livreur)
- **POST** `/api/deliveries/:id/reject`
- **Réponse**: remise à disposition (`statut = commandé`, `livreur = null`).

### 6) Notifier récupération colis (livreur)
- **POST** `/api/deliveries/:id/pickup`
- **Réponse**: `statut = "en_cours"`, `colisRecupere = true`.

### 7) Notifier livraison (livreur)
- **POST** `/api/deliveries/:id/deliver`
- **Réponse**: `statut = "livré"`, `colisLivre = true`, balance livreur créditée (frais livraison).

### 8) Notifier refus client (livreur)
- **POST** `/api/deliveries/:id/refuse`
- Body optionnel: `{ "raisonRefus": "Client absent" }`
- **Réponse**: `statut = "refusé"`, `colisRefuse = true`, remboursement frais colis en attente, balance livreur créditée des frais livraison.

### 9) Confirmation livraison (acheteur)
- **POST** `/api/deliveries/:id/confirm`
- **Réponse**: `statut = "livré"`, balance livreur créditée (si pas déjà).

### 10) Position GPS (livreur)
- **POST** `/api/deliveries/:id/location`
- Body: `{ "latitude": 6.37, "longitude": 2.42, "address": "Cotonou" }`
- **Réponse**: historique GPS mis à jour (`locationHistory`).

### 11) Historiques
- **GET** `/api/deliveries/active` (livreur) → livraisons `assigné | en_cours`.
- **GET** `/api/deliveries/history` (livreur/acheteur) → livraisons `livré | refusé | annulé`.
- **GET** `/api/livreurs/balance/me` (livreur) → balance et stats.
- **GET** `/api/livreurs/balance/me/transactions` (livreur) → transactions (gains, etc.).
- **GET** `/api/livreurs/balance` (admin) → balances paginées.

## Notifications (résumé)
- Création: admins + livreurs en ligne + acheteur (type `delivery`, event `created`).
- Acceptation: admins (event `assigned`).
- Pickup: admins (event `picked_up`).
- Livraison: admins + acheteur + notif “balance mise à jour” au livreur.
- Refus: admins + acheteur (rappel conditions) + notif “balance mise à jour” au livreur.
- Confirmation acheteur: admins + notif “balance mise à jour” au livreur.

## Codes statut clés
- `commandé` → `assigné` → `en_cours` → `livré`
                       ↘ `refusé`

