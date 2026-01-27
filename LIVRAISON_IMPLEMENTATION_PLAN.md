# Plan d'Implémentation - Système de Livraison

## 📦 Modèles créés

✅ **Delivery.js** - Gestion complète des livraisons
✅ **LivreurBalance.js** - Balance et gains du livreur
✅ **Order.js** - Étendu avec champs livraison

## 🔧 Controllers à créer/modifier

### 1. **deliveryController.js** (NOUVEAU) 
- `createDelivery` - Créer une livraison depuis une commande
- `getPendingDeliveries` - Livraisons en attente (pour livreurs)
- `getDeliveryDetails` - Détails d'une livraison
- `acceptDelivery` - Livreur accepte une livraison
- `rejectDelivery` - Livreur refuse une livraison
- `notifyPickup` - Livreur notifie récupération du colis
- `notifyDelivery` - Livreur notifie livraison au client
- `notifyRefusal` - Livreur notifie refus du client
- `confirmDelivery` - Acheteur confirme réception
- `updateLocation` - Mise à jour position GPS livreur
- `getDeliveryHistory` - Historique des livraisons

### 2. **livreurController.js** (À COMPLÉTER)
- ✅ `toggleStatus` - Déjà fait
- ✅ `getStatus` - Déjà fait
- ✅ `updateLocation` - Déjà fait (à améliorer)
- ❌ `getPendingDeliveries` - À implémenter
- ❌ `getActiveDeliveries` - À implémenter
- ❌ `acceptDelivery` - À implémenter
- ❌ `completeDelivery` - À implémenter
- ❌ `getDeliveryHistory` - À implémenter
- ➕ `getBalance` - Nouveau
- ➕ `getBalanceHistory` - Nouveau

### 3. **orderController.js** (À MODIFIER)
- Modifier `createOrder` pour créer automatiquement une Delivery si pièces détachées
- Ajouter affichage conditions de remboursement

### 4. **livreurBalanceController.js** (NOUVEAU)
- `getBalance` - Récupérer balance actuelle
- `getBalanceHistory` - Historique des transactions
- `incrementBalance` - Incrémenter après livraison (interne)
- `getStats` - Statistiques livreur

### 5. **notificationController.js** (À MODIFIER)
- Ajouter notifications pour livraisons
- Notifications push pour livreurs

## 🛣️ Routes à créer/modifier

### 1. **routes/delivery.js** (NOUVEAU)
```javascript
POST /api/deliveries - Créer livraison (admin/acheteur)
GET /api/deliveries/pending - Livraisons en attente (livreur)
GET /api/deliveries/:id - Détails livraison
POST /api/deliveries/:id/accept - Accepter (livreur)
POST /api/deliveries/:id/reject - Refuser (livreur)
POST /api/deliveries/:id/pickup - Notifier récupération (livreur)
POST /api/deliveries/:id/deliver - Notifier livraison (livreur)
POST /api/deliveries/:id/refuse - Notifier refus client (livreur)
POST /api/deliveries/:id/confirm - Confirmer réception (acheteur)
POST /api/deliveries/:id/location - Mettre à jour position (livreur)
GET /api/deliveries/history - Historique (livreur/acheteur)
```

### 2. **routes/livreur.js** (À MODIFIER)
- Ajouter routes balance
- Compléter routes existantes

### 3. **routes/order.js** (À MODIFIER)
- Modifier création commande pour créer Delivery

## 🔔 Système de notifications

### Types de notifications à créer :
1. **Nouvelle commande** → Admin + Livreurs disponibles
2. **Livraison acceptée** → Admin
3. **Livraison refusée** → Admin
4. **Colis récupéré** → Admin
5. **Colis livré** → Admin + Acheteur
6. **Colis refusé par client** → Admin + Acheteur
7. **Balance incrémentée** → Livreur

## 📍 Fonctionnalités Maps

### Pour livreur :
- Itinéraire vers fournisseur (récupération)
- Itinéraire vers acheteur (livraison)

### Pour admin :
- Tracking en temps réel du livreur
- Historique du trajet

## 💰 Logique financière

### Règles de paiement :
1. **Livraison réussie** :
   - Acheteur paie : frais colis + frais livraison
   - Livreur gagne : frais livraison (ou % selon config)

2. **Refus du client** :
   - Acheteur paie : frais livraison uniquement
   - Acheteur remboursé : frais colis
   - Livreur gagne : frais livraison (ou % selon config)

### Conditions de remboursement (à afficher) :
⚠️ **EN ROUGE ET GRAS** :
"En cas de refus du colis, vous serez remboursé uniquement des frais du colis. Les frais de livraison restent dus et ne seront pas remboursés."

## 📊 Prochaines étapes d'implémentation

1. ✅ Créer modèles (Delivery, LivreurBalance)
2. ✅ Étendre modèle Order
3. ⏳ Créer deliveryController.js
4. ⏳ Compléter livreurController.js
5. ⏳ Créer livreurBalanceController.js
6. ⏳ Modifier orderController.js
7. ⏳ Créer routes/delivery.js
8. ⏳ Modifier routes/livreur.js
9. ⏳ Ajouter notifications
10. ⏳ Intégrer calcul distance (API Google Maps/Distance Matrix)
11. ⏳ Tests

## 🔍 Points d'attention

- **Calcul distance** : Utiliser Google Maps Distance Matrix API
- **Tracking GPS** : Mettre à jour position toutes les X secondes
- **Notifications** : Gérer en-app et push
- **Balance** : Transactions atomiques pour éviter conflits
- **Historique** : Tout doit être tracé pour admin
