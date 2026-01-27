# Architecture du Système de Livraison - Rôle Livreur

## 📋 Vue d'ensemble

Système de livraison de pièces détachées avec gestion des rôles : **Acheteur**, **Livreur**, **Admin**.

## 🎯 Flux de commande et livraison

### 1. **Acheteur - Commande**
- Sélectionne une/plusieurs pièces détachées
- Passe commande → Statut: `commandé`
- Notification envoyée à **Admin** et **Livreurs disponibles**
- Conditions de remboursement affichées (en rouge et gras) :
  - ⚠️ **En cas de refus du colis, l'acheteur paie les frais de livraison mais pas les frais du colis**

### 2. **Livreur - Acceptation**
- Reçoit notification de nouvelle commande
- Consulte les détails :
  - Distance en km
  - Lieux (point de départ et destination)
  - Pièces concernées
  - Nom du fournisseur
  - Emplacement du colis
- **Accepter** → Statut: `assigné`, Admin notifié
- **Refuser** → Commande reste disponible pour autres livreurs

### 3. **Livreur - Récupération du colis**
- Utilise Maps pour itinéraire vers le fournisseur
- Notifie la récupération → Statut: `en_cours`
- Admin peut tracker le livreur sur map

### 4. **Livreur - Livraison**
- Utilise Maps pour itinéraire vers l'acheteur
- **Livraison réussie** :
  - Acheteur coche "colis livré" → Statut: `livré`
  - Balance livreur incrémentée
- **Refus du client** :
  - Livreur notifie le refus
  - Ramène le colis au fournisseur
  - Statut: `refusé`
  - Acheteur paie frais de livraison uniquement
  - Remboursement des frais du colis

### 5. **Admin - Suivi**
- Reçoit toutes les notifications
- Peut tracker le livreur en temps réel
- Voit l'historique des retours et paiements
- Voit la balance de chaque livreur

## 📊 Statuts de livraison

```
commandé → assigné → en_cours → livré
                              → refusé
```

## 🗄️ Modèles de données nécessaires

### 1. **Delivery** (Nouveau)
- Informations de livraison complètes
- Statut, livreur, acheteur, commande
- Coordonnées GPS
- Historique des actions

### 2. **DeliveryLocation** (Nouveau)
- Tracking GPS en temps réel
- Historique des positions

### 3. **LivreurBalance** (Nouveau)
- Balance actuelle
- Historique des gains
- Transactions

### 4. **Order** (À étendre)
- Ajouter champs livraison
- Lier à Delivery

## 🔔 Système de notifications

- **En app** : Si livreur connecté → notification sur écran principal
- **Push** : Si livreur déconnecté → notification push
- **Persistante** : Enregistrée dans collection Notification

## 📍 Fonctionnalités Maps

- **Livreur** : Itinéraire vers fournisseur et acheteur
- **Admin** : Tracking en temps réel du livreur

## 💰 Gestion financière

- Frais de livraison (toujours payés)
- Frais du colis (remboursés si refus)
- Balance livreur (incrémentée après livraison réussie)
- Historique complet pour admin
