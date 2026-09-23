# Layaway Tranoo — Objectifs Backend & Plan d’attaque

**Module :** Layaway — Paiement échelonné  
**Périmètre :** Backend / API / logique métier / persistance / paiements  
**Branche de travail :** `SECONDARY`  
**Stack cible :** Express + Mongoose (MongoDB) — `src/`  
**Version document :** 1.0 — Base de développement  
**Date :** 2026-09-23

---

## 0. Verdict sur l’existant

### Ce qui est OK (réutilisable)

| Domaine | Existant | Réutilisation Layaway |
|---------|----------|------------------------|
| Auth / rôles | Firebase + `User.role` / `typeAdmin` | Routes acheteur / admin / (vendeur lecture) |
| Paiement one-shot | FeexPay (`Payment`, webhook, status worker) | Étendre pour `type: layaway` + idempotence |
| Articles véhicule/moto | `Article` (`prix`, `dedouanement`, `statutVente`) | Base véhicule + éligibilité Layaway |
| Settings admin singleton | `SellerGainPricing`, `VerificationPricing`, etc. | Pattern `LayawaySettings` |
| Factures / numérotation | `Invoice`, `invoiceNumberService` | Reçus + facture finale |
| Cron | `node-cron` / `cronJobs` | Détection retards / gel |
| Notifications | `Notification` + push | Rappels échéances / retards |
| Marges vendeur | `SellerGainPricing` | Snapshot pricing dans le dossier |

### Ce qui manque (à construire — vertical neuf)

| Capacité | Statut actuel |
|----------|---------------|
| Modèle / routes / services Layaway | **Absent** (0 occurrence dans `src/`) |
| Publication véhicules Layaway (dashboard) | **Absent** — canal `source=layaway` + statut dédié à créer ; exclusion des listes Tranoo/app |
| Séparation catalogue vs Tranoo / landing | **À forcer** — aujourd’hui `source` = `app` \| `tranoo` seulement |
| Devis multi-cas (douane / hors douane) dédié Layaway | **Absent** (seul `Article.prix` + bool `dedouanement`) |
| Moteur d’échéancier (`ScheduleService`) | **Absent** |
| Garantie financière 5 % (distincte des échéances) | **Absent** |
| Contrat + signature acheteur | **Absent** |
| Paiements échelonnés + premier règlement (garantie + 1ʳᵉ échéance) | **Absent** |
| Machine à états Layaway centralisée | **Absent** |
| Retards / grâce 10 j / gel 3 mois | **Absent** |
| Annulation → remboursement (retenue, virement/chèque) | **Absent** (enums `refunded` seulement) |
| Remise véhicule + validation + gate payout | **Absent** |
| Audit log domaine financier | **Absent** |
| Transactions MongoDB multi-documents | **Jamais utilisées** dans le repo |
| Idempotence webhook robuste (`providerTransactionId` unique) | **Partielle** (pas d’index unique strict sur `transactionId`) |

**Conclusion :** le document métier est cohérent et implémentable. Le backend actuel **n’a pas** de fondation Layaway : il faut un **nouveau module vertical**, branché sur FeexPay, Article, settings singleton, auth et cron. Ne pas tenter d’étendre `Achat` / `Order` comme « quasi-Layaway ».

---

## 1. Objectif du backend

Le backend est **l’unique source de vérité** pour :

- montants, calculs, échéanciers, paiements ;
- états et transitions ;
- règles métier, validations, sécurité ;
- historique et données financières figées.

Le frontend n’envoie que des **choix** :

- `vehicleId` / `articleId`
- `customsCase` (douane / hors douane)
- `frequency` (`DAILY` | `WEEKLY` | `MONTHLY`)
- `duration` (ex. 6 / 12 / 18 / 24 mois)

Il **ne doit jamais** imposer comme vérité :

- `monthlyAmount`, `totalAmount`, `guaranteeAmount`, `remainingBalance`, `percentagePaid`

---

## 2. Principes financiers non négociables

### 2.1 Garantie ≠ échéancier

```
garantie = montantDuDevis × guaranteePercentage / 100
échéancier = 100 % du montantDuDevis   (la garantie N’EST PAS déduite)
```

Exemple : devis 3 000 000 → garantie 150 000 ; échéancier sur **3 000 000**.

### 2.2 Premier règlement

```
totalFirstPayment = guaranteeAmount + firstInstallmentAmount
```

Persister séparément `guaranteeAmount` et `installmentAmount`.

### 2.3 Montant figé

À la création du dossier, snapshot du devis / pricing / paramètres admin.  
Un changement de prix dashboard **ne recalcule pas** les dossiers existants.

### 2.4 Calendrier réel

Durée = période calendaire (`startDate` → `endDate`), **pas** 360/365 jours fixes.  
Gérer années bissextiles et fins de mois (règle fin de mois à figer en phase moteur).

### 2.5 Arrondis

- Toutes les échéances sauf la dernière : montant arrondi (unité FCFA).
- Dernière échéance : reste exact.
- Contrôle : `SUM(installments.amount) === totalAmount` sinon **refus d’enregistrement**.

### 2.6 Progression

```
paidPercentage = totalInstallmentsPaid / totalAmount × 100
```

La garantie **n’entre pas** dans le % de progression du prix.

### 2.7 Solde échéances

```
remainingScheduleBalance = totalAmount - totalInstallmentsPaid
```

Ne pas confondre avec « tous les paiements » (garantie distincte).

---

## 3. Cycle de vie métier (ce que le backend doit gérer)

```
Publication véhicule Layaway (admin)
        ↓
Création dossier (BROUILLON / CONTRAT_EN_ATTENTE)
        ↓
Contrat + signature → CONTRAT_SIGNE
        ↓
Premier règlement (garantie + 1ʳᵉ échéance) confirmé → ACTIF
        ↓
Paiements suivants / retards → EN_RETARD → (seuil) GELE
        ↓
Toutes échéances payées → PAIEMENT_COMPLET
        ↓
Remise → REMISE_EN_ATTENTE → validation → REMISE_VALIDEE
        ↓
Payout vendeur (après remise validée uniquement)
        ↓
Facture finale → CLOTURE

Branche parallèle :
ACTIF → ANNULATION_DEMANDEE → REMBOURSEMENT_EN_COURS → ANNULE
```

### États autorisés

`BROUILLON` · `CONTRAT_EN_ATTENTE` · `CONTRAT_SIGNE` · `ACTIF` · `EN_RETARD` · `GELE` · `PAIEMENT_COMPLET` · `REMISE_EN_ATTENTE` · `REMISE_VALIDEE` · `CLOTURE` · `ANNULATION_DEMANDEE` · `REMBOURSEMENT_EN_COURS` · `ANNULE`

**Règle :** aucun controller ne mute `status` directement — uniquement via `LayawayStateMachine` / service dédié.

---

## 4. Capacités backend détaillées

### 4.1 Catalogue Layaway séparé (admin / dashboard / apps / landing)

**Règle produit :** les véhicules Layaway **ne doivent jamais** apparaître dans :
- la section dashboard **Tranoo** (`source=tranoo`) ;
- la section dashboard **Articles** (vendeurs / app) ;
- les listes landing / vitrines Tranoo ;
- les feeds acheteur classiques (`GET /api/articles` sans filtre Layaway).

Ils auront **leur propre section** dashboard (scission UI à venir) et leurs propres endpoints catalogue.

#### Canal catalogue (séparation dure)

Étendre `Article.source` :

| `source` | Canal | Où ça s’affiche |
|----------|--------|-----------------|
| `app` | Vendeurs / app | Dashboard Articles, feeds app |
| `tranoo` | Stock Tranoo | Dashboard Tranoo, landing Tranoo |
| **`layaway`** | **Stock Layaway** | **Section Layaway uniquement** |

Un article Layaway est créé / géré avec `source: 'layaway'` **obligatoire**.  
Ce n’est **pas** un article `tranoo` « coché Layaway ».

#### Statut publication Layaway (nuancé)

Champ dédié `layawayPublicationStatus` (indépendant du `statut` pub classique) :

| Statut | Signification |
|--------|----------------|
| `BROUILLON` | Configuré admin, non visible acheteur |
| `PUBLIE` | Visible catalogue Layaway acheteur |
| `RESERVE` | Dossier en cours (contrat / 1er paiement) — retiré du catalogue ouvert |
| `ENGAGE` | Layaway `ACTIF` lié — non listé à la vente |
| `REMIS` | Remise validée / parcours terminé |
| `RETIRE` | Désactivé manuellement par l’admin |
| `INDISPONIBLE` | Indispo temporaire (métier) |

#### API catalogue véhicules (Phase 0)

| Méthode | Route | Accès | Rôle |
|---------|-------|-------|------|
| GET | `/api/layaway/vehicles` | Catalogue acheteur (`PUBLIE`) | Public |
| GET | `/api/layaway/vehicles/:id` | Détail si `PUBLIE` (ou admin) | Public / auth |
| GET | `/api/layaway/admin/vehicles` | Liste section Layaway | Admin |
| POST | `/api/layaway/admin/vehicles` | Création (`source=layaway` forcé) | Admin |
| PATCH | `/api/layaway/admin/vehicles/:id` | MAJ fiche / devis | Admin |
| POST | `/api/layaway/admin/vehicles/:id/publish` | → `PUBLIE` | Admin |
| POST | `/api/layaway/admin/vehicles/:id/withdraw` | → `RETIRE` | Admin |
| PATCH | `/api/layaway/admin/vehicles/:id/publication-status` | Transition manuelle | Admin |
| DELETE | `/api/layaway/admin/vehicles/:id` | Soft `RETIRE` si publié, hard si brouillon | Admin |
| GET/PUT | `/api/admin/layaway-settings` | Paramètres métier | Admin dashboard |

#### API dossiers acheteur (création)

| Méthode | Route | Rôle |
|---------|-------|------|
| POST | `/api/layaway/dossiers/preview` | Acheteur — calcul sans persistance |
| POST | `/api/layaway/dossiers` | Acheteur — crée dossier + réserve véhicule |
| GET | `/api/layaway/dossiers` | Acheteur — mes dossiers |
| GET | `/api/layaway/dossiers/:id` | Acheteur — détail + échéancier |
| GET | `/api/layaway/dossiers/:id/schedule` | Acheteur — échéancier seul |
| GET | `/api/layaway/dossiers/:id/contract` | Acheteur — consulter le contrat |
| POST | `/api/layaway/dossiers/:id/contract/sign` | Acheteur — enregistrer signature |
| PUT | `/api/layaway/admin/dossiers/:id/contract/document` | Admin — associer PDF contrat |

Body création / preview (choix uniquement) :

```json
{
  "vehicleId": "...",
  "customsCase": "WITH_CUSTOMS | WITHOUT_CUSTOMS",
  "frequency": "DAILY | WEEKLY | MONTHLY",
  "durationMonths": 12
}
```

Le backend calcule et retourne `guarantee`, `schedule`, `firstPayment`.  
Tout montant envoyé par le client (`totalAmount`, `guaranteeAmount`, …) est **rejeté**.  
À la création : véhicule `PUBLIE` → `RESERVE`, dossier → `CONTRAT_EN_ATTENTE`.  
Le `documentUrl` du contrat est pris depuis `LayawaySettings.defaultContractDocumentUrl` s’il est configuré.

#### Contrat & signature

Body signature :

```json
{
  "firstName": "Jean",
  "lastName": "Dupont",
  "signatureData": "data:image/png;base64,...",
  "signedDocumentUrl": "https://... (optionnel)"
}
```

Règles :
- signature **obligatoire** — pas de `CONTRAT_SIGNE` sans `signatureData` ;
- document contrat doit être associé avant signature ;
- transition unique : `CONTRAT_EN_ATTENTE` → `CONTRAT_SIGNE` ;
- document non modifiable après signature.

#### Paiements (minimum dû + surplus autorisé)

| Méthode | Route | Rôle |
|---------|-------|------|
| GET | `/api/layaway/dossiers/:id/payments/quote` | Min / max / preview allocation |
| POST | `/api/layaway/dossiers/:id/payments` | Crée intent (`Payment` pending) |
| GET | `/api/layaway/dossiers/:id/payments` | Historique paiements dossier |

Règle montant :
- **interdit** de payer moins que le minimum dû ;
- **autorisé** de payer plus : le surplus complète les échéances suivantes dans l’ordre ;
- 1er paiement (garantie non payée) : min = garantie + 1ʳᵉ échéance ;
- suivants : min = reste de la prochaine échéance ouverte ;
- max = garantie impayée + solde total de l’échéancier.

Flux FeexPay :
1. `POST .../payments` → `{ customId, amount }`
2. `POST /api/payments/feexpay/requesttopay/:network` avec ce `customId` + `amount` (réutilise l’intent)
3. Webhook success → allocation garantie / échéances → `ACTIF` (1er) ou MAJ échéancier ; idempotent


Toute liste non-Layaway doit exclure le canal :

```js
source: { $ne: 'layaway' }
```

Sauf requête **explicite** `source=layaway` (ou routes `/api/layaway/vehicles`, `/api/admin/layaway/...`).

À appliquer notamment sur :
- `getArticles` / listes publiques ;
- badges stats dashboard (`articles`, `tranoo`) ;
- tout compteur / feed landing.

#### Paramètres véhicule Layaway

- Devis / cas douane (snapshot ultérieur dans le dossier).
- Publier → `PUBLIE` ; retirer → `RETIRE`.
- Côté acheteur : pas de self-check d’éligibilité — seuls les `PUBLIE` sont listés.

### 4.2 Création du dossier

`POST /api/layaways` (convention à aligner sur `/api/...` existant)

Entrées : choix acheteur uniquement.  
Backend :

1. Auth + rôle acheteur  
2. Véhicule existe + éligible Layaway + non déjà engagé  
3. Résoudre devis selon `customsCase`  
4. Valider fréquence / durée (vs `maxDurationMonths`)  
5. Charger `LayawaySettings` → **copier** dans `appliedParameters`  
6. Calculer garantie  
7. Calculer `startDate` / `endDate`  
8. `ScheduleService.generate(...)` + contrôle d’intégrité  
9. Persister dossier + échéancier + snapshot pricing  
10. Transition → `CONTRAT_EN_ATTENTE` (ou `BROUILLON` selon UX)

### 4.3 Contrat & signature

- Associer document contrat au dossier  
- Consultation acheteur  
- Enregistrement signature (nom, prénom, date, image/signature, IP/device si utile)  
- Version signée persistée  
- `CONTRAT_SIGNE` **uniquement** si signature enregistrée  

### 4.4 Paiements

**Premier paiement :** init FeexPay sur `totalFirstPayment` ; à confirmation, ventiler garantie + 1ʳᵉ échéance ; reçu ; `ACTIF`.

**Paiements suivants :** échéance ciblée, montant attendu calculé backend, confirmation webhook, MAJ échéance + agrégats, reçu.

**Idempotence :** clé `providerTransactionId` (unique). Webhook répété → 1 seul paiement.

**Sécurité :** ignorer / rejeter tout montant arbitraire envoyé par le client ; comparer au montant attendu.

### 4.5 Retards & gel

- Cron quotidien (`03:15 UTC`) : `DelayService.processDueLayaways`  
- Grâce : `delayGracePeriodDays` (défaut 10) depuis `appliedParameters` — avant expiration, pas d’OVERDUE  
- Après grâce : échéance → `OVERDUE`, dossier `ACTIF` → `EN_RETARD`, entrée `delays[]`, notif acheteur  
- Seuil : `defaultThresholdMonths` (défaut 3) depuis `dueDate` de la plus ancienne échéance encore due → `GELE` + `frozenAt`  
- Paiements refusés sur `GELE` (`LAYAWAY_FROZEN`) — **TODO métier** ops / dégel admin  
- Rattrapage : paiement qui solde les OVERDUE → `EN_RETARD` → `ACTIF`, delays `RESOLVED`

### 4.6 Annulation / remboursement

- Demande acheteur → `ANNULATION_DEMANDEE` (pas de saut direct `ANNULE` côté acheteur)  
- Autorisé depuis : `CONTRAT_SIGNE` | `ACTIF` | `EN_RETARD` | `GELE`  
- Retenue : `retentionPercentage` (snapshot) sur **base MVP = total payé** (garantie + échéances) — **TODO métier** base exacte  
- Modes : `BANK_TRANSFER` | `CHECK` uniquement (obligatoires si `refundAmount > 0`)  
- Admin : approve → `REMBOURSEMENT_EN_COURS` (ou `ANNULE` si refund = 0)  
- Admin : reject → retour `previousStatus`  
- Admin : execute-refund → `ANNULE` + libération véhicule `RESERVE`/`ENGAGE` → `PUBLIE`  

### 4.7 Remise / payout / facture / clôture

- `PAIEMENT_COMPLET` → soumission PV signé → `REMISE_EN_ATTENTE`  
- Preuves acheteur : `pvUrl` + `signatureData` (signature du PV)  
- Pièce d’identité : collectée à la **signature du contrat** (`contract.idDocumentUrl`), pas à la remise  
- Photos : hors scope actuel (à revoir plus tard)  
- Validation admin → `REMISE_VALIDEE` + `deliveryValidatedAt` + véhicule `REMIS` + payout `ELIGIBLE`  
- Rejet admin → `delivery.REJECTED`, resoumission possible (reste `REMISE_EN_ATTENTE`)  
- **Payout interdit** si remise ≠ `VALIDATED` (`LAYAWAY_PAYOUT_BLOCKED`)  
- Clôture admin → facture (`nextInvoiceNumber`) + `CLOTURE` + `invoiceIssuedAt` / `closedAt`  
- Timestamps revenu : `paymentCompletedAt`, `deliveryValidatedAt`, `invoiceIssuedAt`, `closedAt`

### 4.8 Audit & admin

- `AuditLog` pour actions sensibles (statut, finance, remise, payout, settings)  
- `GET/PATCH /api/admin/layaways`  
- `GET/PATCH /api/admin/layaway-settings`  
- Paramètres : `guaranteePercentage`, `retentionPercentage`, `maxDurationMonths`, `delayGracePeriodDays`, `defaultThresholdMonths`

---

## 5. Modèle de données cible (conceptuel)

```
Layaway
├── buyerId, vehicleId (article), sellerId
├── pricing (snapshot) : sellerPrice, tranooMargin, fees, customsCase, quote, totalAmount
├── guarantee : percentage, calculationBase, amount, status
├── schedule : frequency, duration, startDate, endDate, numberOfInstallments, installments[]
├── appliedParameters : { guaranteePercentage, retentionPercentage, ... }
├── contract : { status, documentUrl, signedDocumentUrl, signature, signedAt, ... }
├── payments[]
├── delays[]
├── cancellation / refund
├── delivery / invoice / payout
├── status
├── aggregates : totalInstallmentsPaid, remainingScheduleBalance, paidPercentage
└── auditRefs / timestamps métier
```

**Installment :** `id`, `sequence`, `dueDate`, `amount`, `paidAmount`, `remainingAmount`, `status` (`PENDING` | `PARTIALLY_PAID` | `PAID` | `OVERDUE` | `CANCELLED`), `paidAt`

**Indexes recommandés :** `buyerId`, `vehicleId`, `status`, `schedule.installments.dueDate`, `payments.providerTransactionId` (unique), `createdAt`

---

## 6. Architecture cible (alignée Tranoo)

Ne pas mettre la logique dans les controllers.

```
routes/layaway*.js
   ↓
controllers/layaway*.js
   ↓
services/
   LayawayService
   ScheduleService          ← prioritaire, testable unitairement
   GuaranteeService
   LayawayPaymentService
   LayawayWebhookService    (ou extension paymentController + hooks)
   LayawayStateMachine
   DelayService
   CancellationService
   RefundService
   DeliveryService (layaway)
   PayoutService
   InvoiceService (layaway)
   AuditService
   LayawaySettingsService
   ↓
models/ + repositories si besoin
```

**Conventions API existantes à respecter :**

- Préfixe `/api/...` (pas `/api/v1`)
- Auth Bearer Firebase
- Réponses préférées via `utils/apiResponse.js` + codes d’erreur
- OpenAPI sous `src/docs/openapi/`

### Surfaces API (indicatif)

| Zone | Exemples |
|------|----------|
| Acheteur | `.../dossiers`, `.../payments`, `.../delivery`, `.../invoice`, `POST .../cancellation` |
| Webhook | `POST /api/payments/feexpay/webhook` branche `type=layaway` |
| Admin | vehicles, delivery validate/reject, payout, close, cancellation approve/reject/execute-refund, settings |

---

## 7. Points métier encore ouverts (dev possible, prod bloquée)

Documenter en code comme `TODO métier` / feature flags, **sans hardcoder** une décision fausse :

1. Base exacte du calcul de la garantie 5 %  
2. Traitement comptable final de la garantie (à terme / annulation)  
3. Base exacte de la retenue 5 %  
4. Sort de la garantie si Layaway mené à terme  
5. Règle mensuelle si jour inexistant (31 → 28/30 ?)  
6. Indisponibilité véhicule pendant un Layaway actif  
7. Workflow exact après 3 mois de défaut  
8. Opérations autorisées / interdites sur `GELE`  
9. Workflow validation remboursements (qui approuve)  
10. Périmètre paramètres admin modifiables + effet sur dossiers actifs (par défaut : **aucun**)

---

## 8. Plan d’attaque (phased)

### Phase 0 — Fondations (1 lot)

**Objectif :** squelette sans paiements réels + **séparation catalogue**.

- [x] `docs/LAYAWAY_BACKEND.md` (ce fichier) — base + nuance catalogue  
- [ ] Modèles : `LayawaySettings`, `Layaway`, sous-docs installments / guarantee / contract stubs  
- [ ] `LayawayStateMachine` (transitions + erreurs `TRANSITION_INTERDITE`)  
- [ ] `AuditService` minimal  
- [ ] Extension `Article` : `source: 'layaway'` + `layawayPublicationStatus` + devis douane/hors douane  
- [ ] **Exclusion** `source ≠ layaway` sur listes Articles / Tranoo / landing / badges  
- [ ] Routes admin settings + CRUD / publish véhicules Layaway (canal dédié)  
- [ ] Tests : transitions illégales refusées ; article layaway absent des listes classiques  

**Livrable :** admin gère un stock Layaway **isolé** ; settings lus/écrits ; aucun dossier acheteur encore ; zéro fuite vers listes Tranoo/app.

---

### Phase 1 — Moteur financier (cœur, prioritaire)

**Objectif :** calculs corrects, isolés, testés.

- [ ] `GuaranteeService.calculate(base, percentage)`  
- [ ] `ScheduleService.generate({ totalAmount, startDate, endDate, frequency })`  
  - DAILY / WEEKLY / MONTHLY  
  - arrondi + dernière échéance  
  - assert somme = total  
- [ ] Helpers durée calendaire (`addMonths` / fin de période)  
- [ ] Suite de tests dédiée (minimum du §56 du brief) :
  - mensuel 3 000 000 / 12  
  - hebdo (pas de 7 j)  
  - journalier  
  - arrondi 1 000 000 / 3  
  - année bissextile  
  - fin de mois (31 janv.)  

**Livrable :** package testable indépendamment de FeexPay / HTTP.

---

### Phase 2 — Création dossier + contrat

- [ ] `POST /api/layaways` (snapshot pricing + params + échéancier persisté)  
- [ ] `GET` liste / détail / schedule  
- [ ] Upload / association document contrat  
- [ ] `POST .../contract/sign` → `CONTRAT_SIGNE`  
- [ ] Erreurs métier explicites (véhicule non éligible, devis, fréquence, durée…)  

**Livrable :** parcours acheteur jusqu’au contrat signé, sans argent.

---

### Phase 3 — Paiements + webhook + idempotence

- [ ] Étendre `Payment.type` → `layaway` (+ refs `layawayId`, `installmentId`, decomposition garantie)  
- [ ] Init premier paiement (montant **calculé** backend)  
- [ ] Confirmation → ventilation garantie / échéance → `ACTIF`  
- [ ] Paiements d’échéances suivantes  
- [ ] Webhook : vérif authenticité, montant, état, **idempotence** `providerTransactionId` unique  
- [ ] Reçus  
- [ ] Agrégats : solde, % payé (sans double-compter garantie)  
- [ ] Mongo transactions ou écritures atomiques + unique index  
- [ ] Tests : webhook ×3 → 1 paiement ; concurrence  

**Livrable :** dossier ACTIF + échéancier qui se remplit correctement.

---

### Phase 4 — Retards / gel / notifications

- [x] Cron quotidien `DelayService` (`03:15 UTC` via `cronJobs`)  
- [x] Grâce configurable (`delayGracePeriodDays`), historique `delays[]`  
- [x] Notifications in-app (`Notification` type `paiement`, related `Layaway`)  
- [x] Passage `GELE` + garde-fous paiements (déjà dans `assertPayable`)  
- [x] Rattrapage paiement : `EN_RETARD` → `ACTIF` si plus d’OVERDUE  

**Livrable :** dossiers en retard détectés sans intervention manuelle.

---

### Phase 5 — Fin de parcours positif

- [x] `PAIEMENT_COMPLET` auto quand somme échéances OK (webhook allocation)  
- [x] Remise : preuves + validation admin → `REMISE_VALIDEE`  
- [x] Gate payout vendeur (`LayawayPayoutService.assertPayoutAllowed`)  
- [x] Facture finale + `CLOTURE` (`LayawayClosureService`)  
- [x] Timestamps reconnaissance revenu  

**Livrable :** happy path bout-en-bout.

---

### Phase 6 — Annulation / remboursement

- [x] Demande annulation + règles d’autorisation  
- [x] Calcul retenue (paramétré ; base MVP = total payé, TBD métier)  
- [x] Workflow validation + modes BANK_TRANSFER / CHECK  
- [ ] Audit complet (Phase 7 / AuditService)  

**Livrable :** branche négative contrôlée.

---

### Phase 7 — Durcissement & ops

- [ ] OpenAPI / Swagger  
- [ ] Indexes prod  
- [ ] Revue concurrence (double validation, double payout)  
- [ ] Alignement décisions métier §7  
- [ ] Permissions `responsablePaiement` / rôles admin fins  

---

## 9. Ordre de priorité recommandé pour démarrer le code

1. **Séparation catalogue** `source=layaway` + exclusion listes Tranoo/app/landing *(en cours)*  
2. **ScheduleService + tests** (risque métier #1)  
3. **LayawaySettings + snapshot**  
4. **Modèle Layaway + state machine**  
5. **CRUD / publish véhicules admin (section Layaway dédiée)**  
6. **Création dossier**  
7. **Contrat / signature**  
8. **Paiements FeexPay + idempotence**  
9. **Cron retards**  
10. **Remise / payout / facture**  
11. **Annulation / remboursement**

---

## 10. Critères de « done » backend (MVP technique)

Un MVP Layaway backend est considéré prêt quand :

1. Un admin publie un véhicule Layaway et configure les settings.  
2. Un acheteur crée un dossier : garantie + échéancier corrects, montants **figés**.  
3. `SUM(échéances) === totalAmount` toujours.  
4. Contrat signé avant premier paiement.  
5. Premier paiement = garantie + 1ʳᵉ échéance, ventilé.  
6. Webhook idempotent.  
7. % payé ignore la garantie.  
8. Transitions d’état centralisées.  
9. Aucun montant financier critique accepté tel quel depuis le client.  
10. Paramètres admin ne modifient pas les dossiers déjà créés.

---

## 11. Prochaine action concrète

**Fait (Phase 6) :** annulation / retenue / remboursement BANK_TRANSFER|CHECK.

**Suite (Phase 7) — Durcissement & ops :**

1. OpenAPI / indexes / revue concurrence (double validation, double payout).  
2. AuditLog actions sensibles.  
3. Alignement décisions métier §7 + rôles admin fins.  

**Hors scope immédiat :** UI Flutter / dashboard.

---

## 12. Références internes

- Paiements : `src/models/Payment.js`, `src/controllers/paymentController.js`, `src/routes/payment.js`  
- Articles : `src/models/Article.js`  
- Settings singleton : `src/models/SellerGainPricing.js`, `src/routes/sellerGainPricing.js`  
- Auth / rôles : `src/middlewares/auth.js`, `src/middlewares/role.js`  
- Brief métier long : conversation produit Layaway (garanties / échéancier / états)  

---

*Document de pilotage technique — à faire évoluer au fil des validations métier (§7) et des PRs de chaque phase.*
