# Documentation Swagger / OpenAPI — Backend Tranoo

Guide pour comprendre, consulter et maintenir la documentation API du backend Tranoo.

---

## 1. Vue d'ensemble

Tranoo expose sa documentation API via **OpenAPI 3.0** et **Swagger UI**.

| Élément | Détail |
|---------|--------|
| **Spec** | OpenAPI **3.0.0** |
| **UI** | [swagger-ui-express](https://www.npmjs.com/package/swagger-ui-express) |
| **Approche** | Spec **écrite manuellement** en JavaScript (objets JS) |
| **Couverture** | Script automatique qui compare routes Express ↔ doc OpenAPI |

### Ce qu'on ne fait PAS

- Pas d'annotations `@openapi` dans les contrôleurs.
- Pas d'utilisation active de `swagger-jsdoc` (le package est installé mais **non utilisé** dans le code).
- Pas de génération automatique depuis le code Express : la doc est **maintenue à la main** dans `src/docs/openapi/paths/`.

### Pourquoi cette approche ?

- Contrôle total sur les descriptions, tags et schémas.
- Fichiers regroupés par domaine métier (auth, users, payments…).
- Helpers réutilisables pour garder une doc homogène.
- Script `swagger:verify` pour éviter d'oublier un endpoint.

---

## 2. Architecture des fichiers

```
tranoo-api/
├── src/
│   ├── app.js                          # Monte Swagger UI + /api-docs.json
│   ├── config/
│   │   └── swagger.js                  # Point d'entrée : exporte la spec complète
│   ├── docs/
│   │   └── openapi/
│   │       ├── index.js                # Assemble info, tags, components, paths
│   │       ├── components.js           # Schémas partagés + securitySchemes
│   │       ├── tags.js                 # Catégories affichées dans Swagger UI
│   │       ├── helpers.js              # Utilitaires (op, authed, jsonBody…)
│   │       ├── README.md               # Aide-mémoire rapide
│   │       └── paths/                  # Un fichier JS par domaine fonctionnel
│   │           ├── 01-health-auth.js
│   │           ├── 02-users-settings.js
│   │           ├── 03-articles-public.js
│   │           ├── 04-publicites-chauffeur-chat.js
│   │           ├── 05-achat-notifications.js
│   │           ├── 06-payments-wallet.js
│   │           ├── 07-verification-orders-invoices.js
│   │           ├── 08-deliveries-zones-livreurs.js
│   │           ├── 09-tricycles-referrals-agents.js
│   │           ├── 10-views-admin-geo-whatsapp.js
│   │           └── 11-transitaires-transit-stats.js
│   └── routes/                         # Routes Express réelles (code métier)
├── scripts/
│   └── verify_swagger_coverage.js      # Vérifie que tout est documenté
└── package.json                        # Scripts npm swagger:*
```

### Flux de chargement

```
src/app.js
  → require('./config/swagger')
    → require('../docs/openapi').buildOpenApiSpec()
      → charge tags.js, components.js
      → fusionne tous les paths/*.js (tri alphabétique)
```

Chaque fichier dans `paths/` exporte un objet `{ '/api/...': { get: ..., post: ... } }`.  
`index.js` les fusionne avec `Object.assign`.

---

## 3. Exposition HTTP (Swagger UI)

Dans `src/app.js` :

```javascript
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

// Interface graphique Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Spec JSON brute (import Postman, CI, outils externes)
app.get('/api-docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});
```

| URL | Description |
|-----|-------------|
| `GET /api-docs` | Interface Swagger UI (navigateur) |
| `GET /api-docs.json` | Spec OpenAPI en JSON |

### Accès

| Environnement | URL UI | URL JSON |
|---------------|--------|----------|
| **Local** | `http://localhost:5000/api-docs` | `http://localhost:5000/api-docs.json` |
| **Production** | `https://api.tranoo.store/api-docs` | `https://api.tranoo.store/api-docs.json` |

> Le port local par défaut est `5000` (`process.env.PORT || 5000`).

La doc Swagger est **publique** (pas de middleware auth sur `/api-docs`).  
Pour tester les endpoints protégés dans Swagger UI, utiliser le bouton **Authorize** avec un token Firebase.

---

## 4. Dépendances npm

Dans `package.json` :

```json
{
  "dependencies": {
    "swagger-jsdoc": "^6.3.0",
    "swagger-ui-express": "^5.0.1"
  }
}
```

| Package | Rôle réel sur Tranoo |
|---------|----------------------|
| `swagger-ui-express` | ✅ Sert l'interface `/api-docs` |
| `swagger-jsdoc` | ⚠️ Installé mais **non utilisé** (legacy ou prévu pour plus tard) |

Installation (si besoin) :

```bash
cd tranoo-api
npm install
```

---

## 5. Commandes npm

Depuis la racine `tranoo-api/` :

```bash
# Démarrer l'API (puis ouvrir /api-docs)
npm run dev          # nodemon, rechargement auto
npm run start        # node src/app.js

# Compter le nombre de paths documentés
npm run swagger:count

# Vérifier que chaque route Express est documentée
npm run swagger:verify
```

### `npm run swagger:count`

Affiche le nombre de **paths** (URLs) dans la spec :

```bash
npm run swagger:count
# paths: 245
```

Un même path peut avoir plusieurs méthodes (`get`, `post`, etc.).

### `npm run swagger:verify`

Script : `scripts/verify_swagger_coverage.js`

Ce qu'il fait :

1. Parse `src/app.js` pour trouver les montages `app.use('/api/...', require('./routes/xxx'))`.
2. Parse chaque fichier dans `src/routes/` pour extraire `router.get/post/put/patch/delete`.
3. Reconstruit la liste complète des endpoints Express (`GET /api/users/me`, etc.).
4. Compare avec les opérations définies dans `src/docs/openapi/paths/`.
5. Affiche les **manquants** et les **en trop**.

Exemple de sortie :

```
📋 Swagger coverage: 278/281 endpoints documentés

❌ Manquants dans la doc OpenAPI:
   GET /api/admin/seller-gain-pricing
   POST /api/admin/seller-gain-pricing
   PUT /api/admin/seller-gain-pricing

➡️  Ajouter les manquants dans src/docs/openapi/paths/
```

- **Exit code 0** : tout est documenté.
- **Exit code 1** : au moins un endpoint manque.

#### Alias gérés automatiquement

Le script connaît les alias factures :

- `/api/invoices` = `/api/invoice` = `/api/factures`

Documenter une seule fois sous `/api/invoices/...` suffit.

#### Normalisation des paramètres

Express `:id` → OpenAPI `{id}` :

| Express | OpenAPI |
|---------|---------|
| `/api/users/:id` | `/api/users/{id}` |

---

## 6. Authentification dans la doc

### Schéma de sécurité (`components.js`)

```javascript
securitySchemes: {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description: 'Firebase ID token (header Authorization: Bearer …)',
  },
}
```

### Dans Swagger UI

1. Cliquer sur **Authorize** (cadenas).
2. Coller le token Firebase : `Bearer eyJhbG...` ou juste `eyJhbG...` selon la version de Swagger UI.
3. Les routes marquées `authed()` exigent ce token.

### Headers spécifiques web (non dans securitySchemes)

Documentés dans la description globale (`index.js`) :

| Header | Usage |
|--------|-------|
| `Authorization: Bearer <token>` | Auth Firebase (mobile + web) |
| `X-Client-Platform: web` | Session dashboard web |
| `X-Web-Session-Id: <uuid>` | Session unique dashboard |

Ces headers web ne sont pas modélisés comme `securitySchemes` séparés ; ils sont décrits dans les descriptions des opérations concernées.

---

## 7. Tags (catégories Swagger UI)

Définis dans `src/docs/openapi/tags.js`.

Chaque opération doit utiliser un tag **existant**. Exemples :

| Tag | Domaine |
|-----|---------|
| `Santé` | `GET /` |
| `Authentification` | register, sessions web |
| `Utilisateurs` | CRUD users, favoris, FCM |
| `Paiements` | FeexPay, webhooks |
| `Livraisons` | Cycle livraison |
| `Admin — Tarifs` | Tarifs pub, abonnement, vérification |

**Règle** : ne pas inventer un nouveau tag sans l'ajouter dans `tags.js`.

---

## 8. Helpers (`helpers.js`)

Pour éviter de répéter les mêmes blocs OpenAPI :

| Helper | Usage |
|--------|-------|
| `op(tag, summary, opts)` | Opération générique |
| `authed(tag, summary, opts)` | Opération avec `security: [bearerAuth]` |
| `jsonBody(schemaRef, opts)` | Body `application/json` |
| `multipartBody(description)` | Body `multipart/form-data` |
| `pathParam(name, description, type)` | Paramètre `{id}` dans l'URL |
| `queryParam(name, description, opts)` | Query string `?page=1` |
| `OK`, `CREATED`, `NO_CONTENT` | Réponses succès courantes |

Les réponses d'erreur standard (`400`, `401`, `403`, `404`, `409`, `429`, `500`, `503`) sont **injectées automatiquement** via `mergeResponses()` avec le schéma `ApiError`.

### Exemple minimal (route publique)

```javascript
const { op, jsonBody, OK } = require('../helpers');

module.exports = {
  '/api/auth/register': {
    post: op('Authentification', 'Inscription utilisateur', {
      description: 'Crée un compte Firebase + document MongoDB.',
      security: [],  // pas d'auth requise
      requestBody: jsonBody('#/components/schemas/RegisterRequest'),
      responses: { 201: { description: 'Ressource créée' } },
    }),
  },
};
```

### Exemple route protégée avec paramètre path

```javascript
const { authed, pathParam, OK } = require('../helpers');

module.exports = {
  '/api/users/{id}': {
    get: authed('Utilisateurs', 'Détail utilisateur par ID', {
      parameters: [pathParam('id', 'ID MongoDB utilisateur')],
      responses: { 200: OK },
    }),
  },
};
```

### Exemple webhook (sans Bearer)

```javascript
const { op, jsonBody, OK } = require('../helpers');

module.exports = {
  '/api/payments/feexpay/webhook': {
    post: op('Paiements', 'Webhook FeexPay', {
      description: 'Callback serveur FeexPay (sans auth Bearer).',
      security: [],
      requestBody: jsonBody(null),
      responses: { 200: OK },
    }),
  },
};
```

---

## 9. Schémas partagés (`components.js`)

Schémas réutilisables via `$ref` :

| Schéma | Description |
|--------|-------------|
| `ApiError` | Format erreur standard (`success`, `code`, `message`) |
| `ApiSuccess` | Réponse succès générique |
| `RegisterRequest` | Body inscription |
| `WebSessionStart` | Démarrage session web |
| `PasswordResetRequest` | Demande reset OTP |
| `VerifyResetCode` | Vérification code OTP |
| `ResetPassword` | Nouveau mot de passe |
| `UserSettings` | Langue, devise, notifications |
| `ArticleInput` | Création/modification article |
| `OrderInput` | Création commande |
| `DeliveryInput` | Création livraison |
| `ChatMessage` | Message chat |
| `GeoPoint` | Coordonnées lat/lng |
| `PaginationQuery` | page, limit |

Pour un nouveau body récurrent, ajouter le schéma dans `components.js` puis référencer :

```javascript
requestBody: jsonBody('#/components/schemas/MonNouveauSchema')
```

Pour un body ponctuel ou peu structuré :

```javascript
requestBody: jsonBody(null)  // schema: { type: 'object', additionalProperties: true }
```

---

## 10. Workflow : ajouter un nouvel endpoint

### Cas A — Endpoint dans un domaine existant

1. **Créer la route** dans `src/routes/<domaine>.js` (comme d'habitude).
2. **Vérifier le montage** dans `src/app.js` (`app.use('/api/...', ...)`).
3. **Documenter** dans le fichier `paths/` correspondant :

   | Route montée | Fichier paths |
   |--------------|---------------|
   | `/api/auth`, `/api/protected`, `/api/push-otp` | `01-health-auth.js` |
   | `/api/users`, `/api/settings` | `02-users-settings.js` |
   | `/api/articles`, `/api/public`, `/api/upload` | `03-articles-public.js` |
   | `/api/publicites`, `/api/chauffeurs`, `/api/chat` | `04-publicites-chauffeur-chat.js` |
   | `/api/achat`, `/api/notifications` | `05-achat-notifications.js` |
   | `/api/payments`, `/api/wallet` | `06-payments-wallet.js` |
   | `/api/verification`, `/api/orders`, `/api/invoices` | `07-verification-orders-invoices.js` |
   | `/api/deliveries`, `/api/delivery-zones`, `/api/livreurs` | `08-deliveries-zones-livreurs.js` |
   | `/api/tricycles`, `/api/referrals`, `/api/agents` | `09-tricycles-referrals-agents.js` |
   | `/api/views`, `/api/admin/*`, `/api/geo`, `/api/whatsapp` | `10-views-admin-geo-whatsapp.js` |
   | `/api/transitaires`, `/api/transit` | `11-transitaires-transit-stats.js` |

4. **Optionnel** : ajouter un commentaire dans le fichier route :

   ```javascript
   // Doc OpenAPI : src/docs/openapi/paths/01-health-auth.js
   ```

5. **Vérifier** :

   ```bash
   npm run swagger:verify
   npm run swagger:count
   ```

6. **Tester visuellement** : `npm run dev` → `http://localhost:5000/api-docs`

### Cas B — Nouveau préfixe `/api/mon-domaine`

1. Créer `src/routes/monDomaine.js`.
2. Monter dans `src/app.js` :

   ```javascript
   const monDomaineRoutes = require('./routes/monDomaine');
   app.use('/api/mon-domaine', authMiddleware, monDomaineRoutes);
   ```

3. Créer ou étendre un fichier dans `paths/` (ex. `12-mon-domaine.js`).
4. Si nouveau domaine métier : ajouter un tag dans `tags.js`.
5. `npm run swagger:verify`.

### Convention de nommage des fichiers paths

Préfixe numérique pour l'ordre de chargement :

```
01-health-auth.js
02-users-settings.js
…
12-nouveau-domaine.js
```

Les fichiers sont chargés par ordre alphabétique (`sort()` dans `index.js`).

---

## 11. Correspondance Express ↔ OpenAPI

| Express | OpenAPI |
|---------|---------|
| `router.get('/:id', ...)` | `get:` sur `'/api/xxx/{id}'` |
| `app.use('/api/users', router)` + `router.get('/me')` | `'/api/users/me'` |
| `POST` avec `multipart` | `multipartBody('description')` |
| Route sans auth | `security: []` ou helper `op()` |
| Route avec `authMiddleware` | helper `authed()` |

### Middlewares non visibles dans Swagger

Les middlewares Express (`authMiddleware`, `verifyCaptcha`, `authRateLimit`) ne sont pas générés automatiquement.  
Les documenter dans `description` si pertinent (ex. CAPTCHA sur register web, rate limit sur `/api/auth/*`).

---

## 12. Tester un endpoint depuis Swagger UI

1. Démarrer l'API :

   ```bash
   npm run dev
   ```

2. Ouvrir `http://localhost:5000/api-docs`.

3. Pour une route protégée :
   - Obtenir un token Firebase (connexion app ou Firebase console).
   - **Authorize** → coller le token.
   - **Try it out** → **Execute**.

4. Pour une route publique (`security: []`) : pas besoin d'Authorize.

---

## 13. Importer la spec dans d'autres outils

### Postman

```
Import → Link → https://api.tranoo.store/api-docs.json
```

Ou en local : `http://localhost:5000/api-docs.json`

### curl (vérifier que la spec répond)

```bash
curl -s http://localhost:5000/api-docs.json | head -c 200
```

### Génération client (optionnel, hors repo actuel)

La spec OpenAPI 3.0 peut alimenter des générateurs (OpenAPI Generator, etc.).  
Ce workflow n'est pas configuré dans le repo Tranoo aujourd'hui.

---

## 14. Bonnes pratiques équipe

1. **Toujours** lancer `npm run swagger:verify` avant de merger une PR qui ajoute des routes.
2. **Un endpoint = une entrée** dans le bon fichier `paths/`.
3. Utiliser les **helpers** (`authed`, `jsonBody`, `pathParam`) plutôt que du JSON brut.
4. Réutiliser les **schémas** `components.js` pour les bodies récurrents.
5. Choisir le bon **tag** (voir `tags.js`).
6. Marquer les routes **deprecated** avec `deprecated: true` dans l'opération.
7. Documenter les particularités (webhooks sans auth, alias URL, headers web) dans `description`.

---

## 15. Dépannage

| Problème | Solution |
|----------|----------|
| `/api-docs` page blanche | Vérifier que `npm install` a été fait ; regarder les logs au démarrage |
| `swagger:verify` échoue | Lire la liste des endpoints manquants ; les ajouter dans `paths/` |
| Endpoint documenté mais "absent des routes" | Vérifier le montage dans `app.js` ou supprimer la doc obsolète |
| Paramètre `:id` non reconnu | Utiliser `{id}` dans la doc OpenAPI |
| Nouveau tag invisible | L'ajouter dans `tags.js` |
| Token 401 dans Swagger UI | Vérifier que le token Firebase est valide et non expiré |

---

## 16. État actuel (référence)

Dernière vérification documentée :

- **~245 paths** documentés (`npm run swagger:count`)
- **~278/281 endpoints** couverts (`npm run swagger:verify`)
- Endpoints connus comme manquants (à documenter) :
  - `GET /api/admin/seller-gain-pricing`
  - `POST /api/admin/seller-gain-pricing`
  - `PUT /api/admin/seller-gain-pricing`

Relancer les commandes pour un chiffre à jour :

```bash
npm run swagger:count
npm run swagger:verify
```

---

## 17. Références rapides

| Ressource | Chemin |
|-----------|--------|
| Assemblage spec | `src/docs/openapi/index.js` |
| Export config | `src/config/swagger.js` |
| Montage HTTP | `src/app.js` (lignes `/api-docs`) |
| Aide-mémoire court | `src/docs/openapi/README.md` |
| Script couverture | `scripts/verify_swagger_coverage.js` |
| Scripts npm | `package.json` → `swagger:verify`, `swagger:count` |

---

## 18. Checklist PR (nouvelle route API)

- [ ] Route créée dans `src/routes/`
- [ ] Route montée dans `src/app.js`
- [ ] Opération ajoutée dans `src/docs/openapi/paths/`
- [ ] Tag existant ou ajouté dans `tags.js`
- [ ] Schéma body ajouté dans `components.js` si réutilisable
- [ ] `npm run swagger:verify` passe
- [ ] Test visuel sur `http://localhost:5000/api-docs`
