# Layaway Tranoo — Backend (logique finalisée)

**Module :** Layaway — Paiement échelonné  
**Périmètre :** Backend / API / logique métier / persistance / paiements  
**Branche de travail :** `SECONDARY`  
**Stack cible :** Express + Mongoose (MongoDB) — `src/`  
**Version document :** 2.0 — Logique métier finalisée  
**Date :** 2026-10-03

---

## 0. Logique métier retenue (résumé)

1. Admin renseigne devis + params, publie les véhicules éligibles (`source=layaway`).
2. Retenue rupture : **20 % par défaut**, paramétrable dashboard (`retentionPercentage`).
3. Acheteur consulte le catalogue, sélectionne un véhicule → dossier `CONTRAT_EN_ATTENTE`.
4. Acheteur **signe le contrat** → `CONTRAT_SIGNE`.
5. Acheteur **définit ensuite** son échéancier (fréquence + durée) → tours générés backend.
6. Paiements par **tours** jusqu’à l’objectif (= montant du devis). Pas de garantie financière.
7. Retard : grâce **15 jours** ; puis notif + fenêtre **3 mois à compter de la notif**.
8. Régularisation dans la fenêtre → dossier redevient `ACTIF` (pas de pénalité récidive).
9. Sinon → **rupture auto** (`ANNULE` + retenue) ; paiements bloqués.
10. Fin d’échéancier sans objectif atteint → **rupture auto** idem.
11. Objectif atteint → `PAIEMENT_COMPLET` + notif modalités de remise (orga avec admins).
12. Confirmation réception in-app : **hors scope** pour l’instant.

---

## 1. Objectif du backend

Le backend est **l’unique source de vérité** pour :

- montants, calculs, échéanciers (tours), paiements ;
- états et transitions ;
- règles métier, validations, sécurité ;
- historique et données financières figées.

Le frontend n’envoie que des **choix** :

- à la création : `vehicleId`, `customsCase`
- après signature : `frequency`, `durationMonths`
- signature / preuves documentaires

Il **ne doit jamais** imposer comme vérité :

- `monthlyAmount`, `totalAmount`, `remainingBalance`, `percentagePaid`

---

## 2. Principes financiers

### 2.1 Plus de garantie

L’objectif de paiement = **100 % du devis**.  
Aucun acompte / garantie distincte. Le 1er paiement = montant du **1er tour**.

### 2.2 Tours (= installments)

```
montantTour ≈ devis / nombreDeTours  (dernière échéance = reste exact)
SUM(tours.amount) === totalAmount
```

### 2.3 Montant figé

À la création du dossier, snapshot du devis + `appliedParameters` (retenue, grâce, seuil…).  
Un changement dashboard **ne recalcule pas** les dossiers existants.

### 2.4 Progression

```
paidPercentage = totalInstallmentsPaid / totalAmount × 100
toursPaid / toursRemaining = compte des installments PAID vs ouverts
```

### 2.5 Retenue à la rupture

```
retentionAmount = totalPaid × retentionPercentage / 100   (défaut 20 %)
refundAmount    = totalPaid − retentionAmount
```

---

## 3. Cycle de vie métier

```
Publication véhicule Layaway (admin)
        ↓
Sélection véhicule → CONTRAT_EN_ATTENTE
        ↓
Signature contrat → CONTRAT_SIGNE
        ↓
Définition échéancier (tours)
        ↓
1er tour payé → ACTIF
        ↓
Paiements suivants / retards → EN_RETARD
        ↓ (régularisation) ACTIF
        ↓ (deadline 3 mois post-notif OU fin échéancier sans objectif)
        ANNULE (rupture auto + retenue)
        ↓ (objectif atteint)
        PAIEMENT_COMPLET → notif remise
        ↓
Remise admin → REMISE_EN_ATTENTE → REMISE_VALIDEE → CLOTURE

Branche parallèle (demande acheteur) :
ACTIF|EN_RETARD|CONTRAT_SIGNE → ANNULATION_DEMANDEE → REMBOURSEMENT_EN_COURS → ANNULE
```

### États

`BROUILLON` · `CONTRAT_EN_ATTENTE` · `CONTRAT_SIGNE` · `ACTIF` · `EN_RETARD` · `PAIEMENT_COMPLET` · `REMISE_EN_ATTENTE` · `REMISE_VALIDEE` · `CLOTURE` · `ANNULATION_DEMANDEE` · `REMBOURSEMENT_EN_COURS` · `ANNULE`  
(`GELE` = legacy uniquement, plus de transition vers cet état)

**Règle :** aucun controller ne mute `status` directement — uniquement via `LayawayStateMachine` / services.

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

#### API dossiers acheteur

| Méthode | Route | Rôle |
|---------|-------|------|
| POST | `/api/layaway/dossiers/preview` | Preview échéancier (frequency + duration) |
| POST | `/api/layaway/dossiers` | Création : `vehicleId` + `customsCase` → `CONTRAT_EN_ATTENTE` |
| GET | `/api/layaway/dossiers` | Mes dossiers |
| GET | `/api/layaway/dossiers/:id` | Détail |
| GET | `/api/layaway/dossiers/:id/schedule` | Échéancier |
| PUT | `/api/layaway/dossiers/:id/schedule` | Définir tours **après** `CONTRAT_SIGNE` |
| GET | `/api/layaway/dossiers/:id/contract` | Consulter contrat |
| POST | `/api/layaway/dossiers/:id/contract/sign` | Signer |
| PUT | `/api/layaway/admin/dossiers/:id/contract/document` | Admin — associer PDF |

Body création :

```json
{ "vehicleId": "...", "customsCase": "WITH_CUSTOMS | WITHOUT_CUSTOMS" }
```

Body échéancier (après signature) :

```json
{ "frequency": "DAILY | WEEKLY | MONTHLY", "durationMonths": 12 }
```

Le backend calcule les tours. Tout montant client est **rejeté**.  
À la création : véhicule `PUBLIE` → `RESERVE`, dossier → `CONTRAT_EN_ATTENTE` (sans schedule).  
Après signature + `PUT schedule` : tours persistés ; paiements possibles.

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
- **interdit** de payer moins que le minimum dû (reste du prochain tour) ;
- **autorisé** de payer plus : le surplus complète les tours suivants dans l’ordre ;
- max = solde total de l’échéancier ;
- paiement refusé si contrat rompu (`ANNULE` / `breach`) ou échéancier non défini.

Flux FeexPay :
1. `POST .../payments` → `{ customId, amount }`
2. `POST /api/payments/feexpay/requesttopay/:network` avec ce `customId` + `amount` (réutilise l’intent)
3. Webhook success → allocation tours → `ACTIF` (1er) ou MAJ échéancier ; idempotent
4. Objectif atteint → `PAIEMENT_COMPLET` + notif modalités de remise


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

`POST /api/layaway/dossiers`

Entrées : `vehicleId` + `customsCase` uniquement.  
Backend :

1. Auth + rôle acheteur  
2. Véhicule existe + `source=layaway` + `PUBLIE` + non déjà engagé  
3. Résoudre devis selon `customsCase`  
4. Charger `LayawaySettings` → **copier** dans `appliedParameters` (retenue, grâce, seuil…)  
5. Snapshot pricing (devis figé) — **sans** échéancier, **sans** garantie  
6. Véhicule `PUBLIE` → `RESERVE`  
7. Persister dossier → `CONTRAT_EN_ATTENTE`

Échéancier **après** signature : `PUT /api/layaway/dossiers/:id/schedule`  
(`frequency` + `durationMonths` → `ScheduleService.generate` + tours persistés).

### 4.3 Contrat & signature

- Associer document contrat au dossier  
- Consultation acheteur  
- Enregistrement signature (nom, prénom, date, image/signature, IP/device si utile)  
- Version signée persistée  
- `CONTRAT_SIGNE` **uniquement** si signature enregistrée  
- Après signature : l’acheteur définit l’échéancier (`PUT .../schedule`) puis peut payer

### 4.4 Paiements

**Allocation :** tours uniquement (`LayawayPaymentAllocation`) — pas de ventilation garantie.

**Montants :**
- min = reste du prochain tour ouvert  
- max = solde total de l’échéancier  
- surplus autorisé → complète les tours suivants dans l’ordre

**États payables (`assertPayable`) :** `CONTRAT_SIGNE` (si schedule défini) | `ACTIF` | `EN_RETARD`  
Refus si : `ANNULE` / `breach` / pas de schedule / contrat non signé / `GELE` legacy.

**Premier paiement confirmé :** allocation sur le 1er tour → `ACTIF`.  
**Objectif atteint :** → `PAIEMENT_COMPLET` + notif modalités de remise.

**Idempotence :** clé `providerTransactionId` (unique). Webhook répété → 1 seul paiement.

**Sécurité :** ignorer / rejeter tout montant arbitraire envoyé par le client ; comparer au quote backend.

### 4.5 Retards & rupture auto

- Cron quotidien (`03:15 UTC`) : `DelayService.processDueLayaways`
- Grâce : `delayGracePeriodDays` (**défaut 15**) — avant expiration, pas d’OVERDUE
- Après grâce : tour → `OVERDUE`, dossier `ACTIF` → `EN_RETARD`, entrée `delays[]`, **notif acheteur**
- À la notif : `regularizationDeadlineAt = notifiedAt + defaultThresholdMonths` (**3 mois**)
- Pendant la fenêtre : paiements **autorisés** pour régulariser → `EN_RETARD` → `ACTIF` (pas de pénalité récidive)
- Deadline dépassée avec retard ouvert → **rupture auto** (`LayawayBreachService`, reason `DELAY_WINDOW_EXPIRED`) → `ANNULE` + retenue
- Fin d’échéancier (`endDate` passé) + solde > 0 → rupture auto (`SCHEDULE_ENDED_UNPAID`)
- Après rupture : **aucun nouveau paiement** (`LAYAWAY_BREACHED`)

### 4.6 Annulation / remboursement / retenue

- Demande acheteur → `ANNULATION_DEMANDEE` (pas de saut direct `ANNULE` côté acheteur)
- Autorisé depuis : `CONTRAT_SIGNE` | `ACTIF` | `EN_RETARD`
- Retenue : `retentionPercentage` (**défaut 20 %**) sur **total tours payés**
- Modes : `BANK_TRANSFER` | `CHECK` uniquement (si `refundAmount > 0`)
- Admin : approve → `REMBOURSEMENT_EN_COURS` (ou `ANNULE` si refund = 0)
- Admin : reject → retour `previousStatus`
- Admin : execute-refund → `ANNULE` + libération véhicule  

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
- Paramètres : `retentionPercentage` (défaut 20), `maxDurationMonths`, `delayGracePeriodDays` (défaut 15), `defaultThresholdMonths` (défaut 3)  
- `guaranteePercentage` : **déprécié** (ignoré par le flux métier)

---

## 5. Modèle de données (aligné code)

```
Layaway
├── buyerId, vehicleId (article), sellerId
├── pricing (snapshot) : sellerPrice, tranooMargin, fees, customsCase, quote, totalAmount
├── guarantee : @deprecated (NONE / 0 — ignoré par le flux métier)
├── schedule : optionnel à la création ; frequency, durationMonths, startDate, endDate,
│              numberOfInstallments, installments[], definedAt
├── appliedParameters : { retentionPercentage, maxDurationMonths, delayGracePeriodDays,
│                         defaultThresholdMonths, currency, snapshottedAt,
│                         guaranteePercentage? (@deprecated) }
├── contract : { status, documentUrl, signedDocumentUrl, signature, idDocumentUrl, signedAt, ... }
├── payments[]
├── delays[] : { installmentSequence, dueDate, graceEndsAt, overdueAt, resolvedAt,
│                status, notifiedOverdueAt, regularizationDeadlineAt }
├── breach : { reason, breachedAt, retentionPercentage, retentionAmount, refundAmount, totalPaid }
├── cancellation / refund
├── delivery / invoice / payout
├── status (+ frozenAt @deprecated legacy GELE)
├── aggregates : totalInstallmentsPaid, remainingScheduleBalance, paidPercentage,
│                toursPaid / toursRemaining (progression)
└── timestamps métier (paymentCompletedAt, deliveryValidatedAt, …)
```

**Installment :** `id`, `sequence`, `dueDate`, `amount`, `paidAmount`, `remainingAmount`, `status` (`PENDING` | `PARTIALLY_PAID` | `PAID` | `OVERDUE` | `CANCELLED`), `paidAt`

**Breach reasons :** `DELAY_WINDOW_EXPIRED` | `SCHEDULE_ENDED_UNPAID`

**Indexes :** `buyerId`, `vehicleId`, `status`, `schedule.endDate`, `schedule.installments.dueDate`, `delays.regularizationDeadlineAt`, `breach.breachedAt`, `payments.providerTransactionId` (unique), `createdAt`

---

## 6. Architecture (alignée Tranoo)

Ne pas mettre la logique dans les controllers.

```
routes/layaway.js
   ↓
controllers/layaway*.js
   ↓
services/layaway/
   LayawayService              ← création dossier / schedule / agrégats
   ScheduleService             ← génération tours (testable)
   LayawayPaymentService       ← quote + intents + assertPayable
   LayawayPaymentAllocation    ← allocation sur installments
   LayawayStateMachine
   DelayService                ← grâce 15j + fenêtre 3 mois
   LayawayBreachService        ← rupture auto + retenue
   LayawayCancellationService
   LayawayContractService
   LayawayDeliveryService
   LayawayPayoutService
   LayawayClosureService
   LayawayCatalogService
   LayawaySettingsService
   GuaranteeService            ← @deprecated (legacy)
   ↓
models/Layaway.js, LayawaySettings.js
cron : utils/cronJobs.js → DelayService.processDueLayaways
```

**Conventions API existantes à respecter :**

- Préfixe `/api/...` (pas `/api/v1`)
- Auth Bearer Firebase
- Réponses préférées via `utils/apiResponse.js` + codes d’erreur
- OpenAPI sous `src/docs/openapi/` (à compléter — Phase 7)

### Surfaces API

| Zone | Exemples |
|------|----------|
| Acheteur | `.../dossiers`, `PUT .../schedule`, `.../payments`, `.../delivery`, `.../invoice`, `POST .../cancellation` |
| Webhook | `POST /api/payments/feexpay/webhook` branche `type=layaway` |
| Admin | vehicles, delivery validate/reject, payout, close, cancellation approve/reject/execute-refund, settings |

---

## 7. Points métier encore ouverts

**Tranchés (logique finalisée 2026-10-03) — ne plus rouvrir sans décision produit :**

| Sujet | Décision |
|-------|----------|
| Garantie financière | **Supprimée** du flux (1er paiement = 1er tour) |
| Retenue rupture | **20 %** défaut, paramétrable ; base = total tours payés |
| Grâce retard | **15 jours** |
| Post-défaut | Notif + fenêtre **3 mois depuis la notif** ; paiements OK pour régulariser |
| Fin fenêtre / fin échéancier sans objectif | **Rupture auto** → `ANNULE` + retenue (`LayawayBreachService`) |
| État `GELE` | **Legacy** — plus de nouvelle transition vers `GELE` |

**Encore ouverts (nuances front / ops / produit) :**

1. Règle mensuelle si jour inexistant (31 → 28/30 ?) — vérifier comportement `ScheduleService` vs attente métier  
2. Mapping exact des champs dashboard (settings, devis véhicule, widgets) ↔ API — **à valider avec le front**  
3. Confirmation réception véhicule in-app — **hors scope**  
4. Migration dossiers existants créés avec ancienne garantie — **hors scope MVP**  
5. Workflow validation remboursements (rôles admin fins / `responsablePaiement`)  
6. Périmètre paramètres admin modifiables + effet sur dossiers actifs (par défaut : **aucun** — snapshot)  
7. OpenAPI, indexes prod, revue concurrence, AuditLog complet  

---

## 8. Plan d’attaque (phased) — état

### Phase 0 — Fondations + catalogue

- [x] `docs/LAYAWAY_BACKEND.md`  
- [x] Modèles `LayawaySettings`, `Layaway`  
- [x] `LayawayStateMachine`  
- [x] `Article.source: 'layaway'` + `layawayPublicationStatus`  
- [x] Exclusion catalogue + routes admin vehicles / settings  
- [ ] `AuditService` minimal (reporté Phase 7)  

### Phase 1 — Moteur financier

- [x] `ScheduleService.generate` (DAILY / WEEKLY / MONTHLY) + intégrité somme  
- [x] Tests schedule / state-machine / allocation / delays / breach / cancel (`tests/layawaySchedule.test.js`)  
- [x] Garantie retirée du flux (service legacy conservé `@deprecated`)  

### Phase 2 — Création dossier + contrat + schedule

- [x] `POST /dossiers` : `vehicleId` + `customsCase` → `CONTRAT_EN_ATTENTE` (sans schedule)  
- [x] Signature → `CONTRAT_SIGNE`  
- [x] `PUT /dossiers/:id/schedule` après signature  
- [x] Preview échéancier sans garantie  

### Phase 3 — Paiements + webhook

- [x] Quote min/max + intents FeexPay (`type=layaway`)  
- [x] Allocation tours uniquement → `ACTIF` / `PAIEMENT_COMPLET`  
- [x] Idempotence webhook `providerTransactionId`  
- [x] Blocage si rompu / pas de schedule  

### Phase 4 — Retards / fenêtre 3 mois / rupture auto

- [x] Cron `DelayService` (`03:15 UTC`)  
- [x] Grâce 15 j → `OVERDUE` + `EN_RETARD` + notif + `regularizationDeadlineAt`  
- [x] Régularisation → `ACTIF` (pas de pénalité récidive)  
- [x] `LayawayBreachService` : fin fenêtre / fin échéancier → `ANNULE` + retenue  
- [x] Retrait du chemin métier `GELE`  

### Phase 5 — Remise / payout / clôture

- [x] Notif modalités de remise à `PAIEMENT_COMPLET`  
- [x] Remise PV + signature ; ID à la signature contrat  
- [x] Payout gate + facture + `CLOTURE`  

### Phase 6 — Annulation / remboursement

- [x] Demande acheteur + retenue 20 % sur tours payés  
- [x] Approve / reject / execute-refund (BANK_TRANSFER | CHECK)  

### Phase 7 — Durcissement & ops *(reste à faire)*

- [ ] OpenAPI / Swagger Layaway  
- [ ] Indexes prod / revue concurrence  
- [ ] AuditLog actions sensibles  
- [ ] Rôles admin fins  
- [ ] Alignement champs dashboard ↔ API (§7.2)  

---

## 9. Priorité pour le prochain dev

1. **Front / dashboard** : brancher sur l’API finalisée ; valider mapping données (§7.2)  
2. Phase 7 ops (OpenAPI, audit, concurrence)  
3. Décider migration dossiers legacy avec garantie (si existants en base)  
4. Confirmation réception in-app (si produit le demande)  

---

## 10. Critères de « done » backend (logique finalisée)

Le backend Layaway (logique métier) est prêt quand :

1. Admin publie un véhicule Layaway + settings (retenue 20 %, grâce 15 j, seuil 3 mois).  
2. Acheteur crée un dossier : snapshot devis/params **sans** schedule ni garantie.  
3. Signature puis `PUT schedule` : `SUM(tours) === totalAmount`.  
4. Paiements = tours uniquement ; min = prochain tour ; max = solde.  
5. Webhook idempotent ; transitions via `LayawayStateMachine`.  
6. Retard → grâce → notif + fenêtre 3 mois ; régularisation possible.  
7. Fin fenêtre / fin échéancier sans objectif → rupture auto + retenue.  
8. Objectif atteint → `PAIEMENT_COMPLET` + notif remise ; parcours remise/payout/clôture OK.  
9. Annulation acheteur : retenue paramétrée sur total tours payés.  
10. Params admin ne recalculent pas les dossiers déjà créés (snapshot).  
11. Tests `tests/layawaySchedule.test.js` verts.

---

## 11. État actuel & suite

**Branche :** `SECONDARY` (dev) — **ne pas merger en prod** tant que front + nuances données §7 ne sont pas validés.

**Fait :** logique métier finalisée (flux, paiements, retards, rupture, annulation, remise) + doc + tests.

**Suite recommandée :**

1. Front dash / apps : consommer les endpoints et valider les champs.  
2. Phase 7 (OpenAPI, audit, concurrence, rôles).  
3. Migration legacy garantie si nécessaire.

**Hors scope immédiat :** UI Flutter / confirmation réception in-app.

---

## 12. Références internes

- Routes : `src/routes/layaway.js`  
- Services : `src/services/layaway/`  
- Modèles : `src/models/Layaway.js`, `src/models/LayawaySettings.js`  
- Tests : `tests/layawaySchedule.test.js`  
- Cron : `src/utils/cronJobs.js`  
- Paiements FeexPay : `src/models/Payment.js`, `src/controllers/paymentController.js`  
- Articles : `src/models/Article.js`  
- Auth / rôles : `src/middlewares/auth.js`, `src/middlewares/role.js`  

---

*Document de pilotage technique — logique métier finalisée (v2.0, 2026-10-03). Mettre à jour §7 / Phase 7 au fil du handoff front.*
