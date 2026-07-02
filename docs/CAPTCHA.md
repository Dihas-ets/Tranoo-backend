# Intégration CAPTCHA Tranoo — Cloudflare Turnstile

Documentation : principe, configuration, déploiement et implémentation dans le projet Tranoo.

---

## Table des matières

1. [Vue d’ensemble](#1-vue-densemble)
2. [Création du compte Cloudflare Turnstile](#2-création-du-compte-cloudflare-turnstile)
3. [Variables d’environnement (.env)](#3-variables-denvironnement-env)
4. [Architecture et flux](#4-architecture-et-flux)
5. [Implémentation backend (Express)](#5-implémentation-backend-express)
6. [Implémentation web (tranoo_landing / Next.js)](#6-implémentation-web-tranoo_landing--nextjs)
7. [Applications mobiles Flutter (état actuel)](#7-applications-mobiles-flutter-état-actuel)
8. [Pages web protégées](#8-pages-web-protégées)
9. [Rate limiting](#9-rate-limiting)
10. [Codes d’erreur API](#10-codes-derreur-api)
11. [Déploiement en production](#11-déploiement-en-production)
12. [Dépannage](#12-dépannage)
13. [Évolutions prévues](#13-évolutions-prévues)

---

## 1. Vue d’ensemble

### Pourquoi un CAPTCHA ?

Tranoo utilise **Cloudflare Turnstile** (gratuit) pour protéger les actions sensibles côté **web** contre les bots et les inscriptions automatisées :

- Connexion admin / agents (`/login`)
- Inscription publique agent commercial (`/inscription-agent-com`)
- Endpoint API `POST /api/auth/register` (inscriptions web sans `authApp` mobile)

### Périmètre actuel

| Zone | CAPTCHA actif ? | Remarque |
|------|-----------------|----------|
| **Web** (`tranoo_landing`) | ✅ Oui | Login + inscription agent |
| **Backend** (`tranoo-api`) | ✅ Oui | Vérification serveur sur `/auth/register` |
| **Apps mobile** (`tranoo`, `tranoo_pro`) | ❌ Non (pour l’instant) | Code préparé mais commenté ; backend exempte `authApp: tranoo` / `tranoo_pro` |

### Technologie

- **Fournisseur** : [Cloudflare Turnstile](https://www.cloudflare.com/products/turnstile/)
- **Widget web** : package npm `@marsidev/react-turnstile`
- **Vérification serveur** : API Cloudflare `https://challenges.cloudflare.com/turnstile/v0/siteverify`

### Principe en 3 étapes

```
1. L’utilisateur voit le widget Turnstile sur la page web
2. Cloudflare génère un token éphémère (captchaToken)
3. Le serveur Tranoo vérifie ce token auprès de Cloudflare avant d’accepter l’action
```


> **Important** : le token Turnstile est **à usage unique** et **court** (quelques minutes). Il ne doit jamais être stocké ni réutilisé.

---

## 2. Création du compte Cloudflare Turnstile

### Lien direct

👉 **Dashboard Turnstile** :  
https://dash.cloudflare.com/?to=/:account/turnstile

(Si besoin, créer d’abord un compte Cloudflare gratuit : https://dash.cloudflare.com/sign-up)

### Procédure pas à pas

1. Se connecter à Cloudflare
2. Aller dans **Turnstile** → **Add site** (ou **Add widget**)
3. Renseigner un **nom** (ex. `Tranoo Web Production`)
4. Choisir le **mode widget** :
   - **Managed** (recommandé) : challenge automatique, peu intrusif
5. Renseigner les **hostnames** autorisés :

| Environnement | Hostname à ajouter |
|---------------|-------------------|
| Développement local | `localhost` |
| Production site web | `tranoo.store` |

6. Valider et récupérer les deux clés :

| Clé | Usage | Où la mettre |
|-----|-------|--------------|
| **Site Key** (publique) | Affiche le widget dans le navigateur | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (web) |
| **Secret Key** (privée) | Vérifie le token côté serveur | `TURNSTILE_SECRET_KEY` (backend + web) |

### ⚠️ Erreur fréquente : mauvais hostname

Le hostname Turnstile correspond au **domaine où le widget s’affiche** (le site Next.js), **pas** au domaine de l’API.

| Domaine | À mettre dans Turnstile ? |
|---------|---------------------------|
| `tranoo.store` | ✅ Oui (pages `/login`, `/inscription-agent-com`) |
| `localhost` | ✅ Oui (dev local) |
| `api.tranoo.store` | ❌ Non (pas de widget sur l’API) |

Si le dashboard admin est sur un autre sous-domaine (ex. `admin.tranoo.store`), l’ajouter aussi dans Turnstile.

### URLs web concernées (production)

| Page | URL |
|------|-----|
| Connexion | https://tranoo.store/login |
| Inscription agent commercial | https://tranoo.store/inscription-agent-com |

---

## 3. Variables d’environnement (.env)

### Backend Express — `tranoo-api/.env`

Fichier modèle : `.env.captcha.example`

```env
# ─── Cloudflare Turnstile (CAPTCHA) ───────────────────────────────
# Secret Key récupérée sur https://dash.cloudflare.com/?to=/:account/turnstile
TURNSTILE_SECRET_KEY=0x4AAAAAAAxxxxxxxxxxxxxxxxxxxxxxxx

# Active/désactive la vérification CAPTCHA côté backend
# true par défaut si la variable est absente
CAPTCHA_ENABLED=true

# ─── Rate limiting sur /api/auth/* ────────────────────────────────
# 40 requêtes max par IP sur 15 minutes (valeur par défaut)
AUTH_RATE_LIMIT_MAX=40

# Mettre false pour désactiver le rate limit en dev
# AUTH_RATE_LIMIT_ENABLED=false

# ─── Firebase App Check (optionnel, phase ultérieure) ─────────────
# FIREBASE_APP_CHECK_ENFORCED=false
```

### Web Next.js — `tranoo_landing/.env.local`

Fichier modèle : `tranoo_landing/.env.example`

```env
# Clé publique (widget visible dans le navigateur)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAAxxxxxxxxxxxxxxxxxxxxxxxx

# Même Secret Key que le backend (vérification route Next /api/captcha/verify)
TURNSTILE_SECRET_KEY=0x4AAAAAAAxxxxxxxxxxxxxxxxxxxxxxxx

# Désactiver temporairement en dev sans clés
# CAPTCHA_ENABLED=false

# URL du backend (rewrite Next.js → Express)
# NEXT_PUBLIC_API_URL=https://api.tranoo.store/api
```

### Règles importantes

| Règle | Détail |
|-------|--------|
| **Même Secret Key** | Backend et `tranoo_landing` utilisent la **même** `TURNSTILE_SECRET_KEY` |
| **Site Key uniquement côté web** | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` ne va **jamais** dans le backend |
| **Secret Key jamais exposée au client** | Ne pas préfixer par `NEXT_PUBLIC_` sauf si absolument nécessaire côté serveur Next (route API interne) |
| **Ne pas committer les .env** | Les fichiers `.env` et `.env.local` restent hors git |

### Mode développement sans clés

Si `TURNSTILE_SECRET_KEY` est vide :

- Backend : vérification **ignorée** (log warning `[CAPTCHA] TURNSTILE_SECRET_KEY manquant`)
- Web route `/api/captcha/verify` : retourne `{ ok: true, skipped: true }`
- Widget : affiche un message « CAPTCHA non configuré » si `NEXT_PUBLIC_TURNSTILE_SITE_KEY` manque

Pour forcer la désactivation :

```env
CAPTCHA_ENABLED=false
```

---

## 4. Architecture et flux

### Schéma global

```
┌─────────────────────────────────────────────────────────────────┐
│  Navigateur (tranoo.store)                                        │
│  ┌──────────────┐    token      ┌─────────────────────────────┐ │
│  │ Turnstile    │ ────────────► │ Page /login ou /inscription │ │
│  │ widget       │               └──────────────┬──────────────────┘ │
└──────────────────────────────────────────────┼────────────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          ▼                          │
                    │  Cas LOGIN              │  Cas INSCRIPTION            │
                    │  POST /api/captcha/verify│  POST /api/auth/register  │
                    │  (Next.js interne)      │  + captchaToken dans body │
                    └──────────────────────────┼──────────────────────────┘
                                               │
                    ┌──────────────────────────▼──────────────────────────┐
                    │  Vérification Cloudflare Turnstile                    │
                    │  POST challenges.cloudflare.com/turnstile/v0/siteverify│
                    └──────────────────────────┬──────────────────────────┘
                                               │ success
                    ┌──────────────────────────▼──────────────────────────┐
                    │  Action autorisée (Firebase login ou création user)  │
                    └─────────────────────────────────────────────────────┘
```

### Flux — Connexion (`/login`)

1. L’utilisateur remplit email / mot de passe
2. Le widget Turnstile génère un `captchaToken`
3. Le front appelle `POST /api/captcha/verify` (route **Next.js**, pas Express directement)
4. Si OK → `signInWithEmailAndPassword` (Firebase) → appels API backend (`/protected/me`, `/auth/web-session/start`)
5. Si échec CAPTCHA → message traduit, widget réinitialisé

### Flux — Inscription agent (`/inscription-agent-com`)

1. L’utilisateur remplit le formulaire + valide Turnstile
2. `POST /api/auth/register` avec `captchaToken` dans le body
3. Next.js rewrite `/api/*` → `https://api.tranoo.store/api/*`
4. Middleware Express `verifyCaptcha` vérifie le token
5. Si OK → `authController.register` crée l’utilisateur

### Flux — Inscription mobile (exemptée)

Les apps Flutter envoient `authApp: "tranoo"` ou `authApp: "tranoo_pro"` dans le body de `/auth/register`.

Le middleware `verifyCaptcha` **ignore** le CAPTCHA pour ces requêtes (CAPTCHA mobile à activer plus tard).

---

## 5. Implémentation backend (Express)

### Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `src/utils/turnstile.js` | Appel API Cloudflare `siteverify` |
| `src/middlewares/verifyCaptcha.js` | Middleware Express : exige un token valide |
| `src/middlewares/authRateLimit.js` | Limite le nombre de requêtes sur `/api/auth/*` |
| `src/routes/auth.js` | Route `POST /register` protégée par CAPTCHA + rate limit |
| `src/utils/errorCodes.js` | Codes `CAPTCHA_*`, `RATE_LIMITED` |
| `src/utils/apiResponse.js` | Messages d’erreur localisés (fr/en/ar) |
| `src/middlewares/verifyAppCheck.js` | Firebase App Check (optionnel, non activé) |

### Route protégée

```javascript
// src/routes/auth.js
router.use(authRateLimit);
router.post('/register', verifyCaptcha, authController.register);
```

URL complète : `POST https://api.tranoo.store/api/auth/register`

### Middleware `verifyCaptcha` — logique d’exemption

Le CAPTCHA est **ignoré** si :

1. `CAPTCHA_ENABLED=false` dans `.env`
2. `TURNSTILE_SECRET_KEY` absente (mode dev)
3. Body contient `authApp: "tranoo"` ou `authApp: "tranoo_pro"` (mobile)
4. Requête authentifiée par un **admin dashboard** (rôles : `admin`, `superAdmin`, `principal`, `gestionnaire`)

Le CAPTCHA est **exigé** si :

- Inscription web publique sans `authApp` mobile
- Pas de token admin Bearer valide

### Où lire le token côté backend

Le middleware accepte le token dans (par ordre) :

```javascript
req.body.captchaToken
req.headers['x-captcha-token']
req.headers['x-turnstile-token']
```

### Vérification Cloudflare (`src/utils/turnstile.js`)

```javascript
POST https://challenges.cloudflare.com/turnstile/v0/siteverify
Content-Type: application/x-www-form-urlencoded

secret=<TURNSTILE_SECRET_KEY>
response=<token_utilisateur>
remoteip=<IP_client>   // optionnel
```

Réponse attendue : `{ "success": true }`

---

## 6. Implémentation web (tranoo_landing / Next.js)

### Dépendance npm

```json
"@marsidev/react-turnstile": "^1.5.3"
```

### Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `components/TurnstileField.tsx` | Composant widget réutilisable |
| `lib/turnstile.ts` | Helper client `verifyCaptchaToken()` |
| `app/api/captcha/verify/route.ts` | Route API Next.js (vérification serveur login) |
| `app/login/page.tsx` | CAPTCHA avant connexion Firebase |
| `app/inscription-agent-com/page.tsx` | CAPTCHA + `captchaToken` sur register |
| `messages/fr.json` (et en/ar) | Textes `captchaRequired`, `captchaFailed` |

### Composant `TurnstileField`

```tsx
<TurnstileField
  onToken={(token) => setCaptchaToken(token)}
  onExpire={() => setCaptchaToken("")}
  onError={() => setCaptchaToken("")}
/>
```

- Lit `process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- Affiche un avertissement si la clé manque
- Réinitialise le widget à l’expiration ou en cas d’erreur

### Vérification login (côté Next, pas Express)

```typescript
// lib/turnstile.ts
const res = await fetch("/api/captcha/verify", {
  method: "POST",
  body: JSON.stringify({ token }),
});
```

La route `app/api/captcha/verify/route.ts` utilise la **même** logique que le backend (`TURNSTILE_SECRET_KEY` + appel Cloudflare).

### Inscription — envoi du token au backend

```typescript
await axios.post("/auth/register", {
  nom, prenoms, email, telephone, /* ... */
  captchaToken,  // ← obligatoire pour inscription web
});
```

`axios` est configuré avec `baseURL: '/api'` ; Next.js rewrite vers le backend Express.

### Proxy API (next.config.ts)

```typescript
// /api/:path* → https://api.tranoo.store/api/:path*
```

Variable optionnelle : `NEXT_PUBLIC_API_URL` ou `API_URL`

---

## 7. Applications mobiles Flutter (état actuel)

### CAPTCHA désactivé volontairement

Le code est **préparé** mais **commenté** dans :

| Fichier | App |
|---------|-----|
| `tranoo/lib/utils/turnstile_captcha.dart` | Tranoo acheteurs |
| `tranoo_pro/lib/utils/turnstile_captcha.dart` | Tranoo Pro |
| `tranoo/lib/config/turnstile_config.dart` | Config site key |
| `tranoo_pro/lib/config/turnstile_config.dart` | Config site key |
| `tranoo/lib/data/screens/inscription_page.dart` | Appels commentés |
| `tranoo_pro/lib/data/screens/inscription_page.dart` | Appels commentés |

### Pourquoi exempté côté backend ?

```javascript
// verifyCaptcha.js
if (authApp === 'tranoo' || authApp === 'tranoo_pro') {
  return true; // skip CAPTCHA
}
```

### Réactivation mobile (quand souhaité)

1. Créer un widget Turnstile Turnstile dans Cloudflare avec hostname adapté (ou mode invisible)
2. Build Flutter avec :
   ```bash
   flutter build apk --dart-define=TURNSTILE_SITE_KEY=votre_site_key
   ```
3. Décommenter le code dans `inscription_page.dart`
4. Retirer l’exemption `authApp` dans `verifyCaptcha.js` (ou la conditionner à une variable d’env)

Le helper mobile ouvre une WebView avec le script Turnstile et renvoie le token via `JavascriptChannel`.

`user_service.dart` accepte déjà `captchaToken` optionnel dans `registerUser()`.

---

## 8. Pages web protégées

| Page | URL | Mécanisme CAPTCHA |
|------|-----|-------------------|
| Login dashboard / agents | `/login` | `TurnstileField` → `POST /api/captcha/verify` (Next) → puis Firebase |
| Inscription agent commercial | `/inscription-agent-com` | `TurnstileField` → `captchaToken` dans `POST /api/auth/register` (Express) |
| Création user par admin (dashboard connecté) | Dashboard interne | **Exempté** (admin authentifié Bearer) |
| Inscription app mobile | Apps Flutter | **Exempté** (`authApp: tranoo` / `tranoo_pro`) |

---

## 9. Rate limiting

En complément du CAPTCHA, toutes les routes `/api/auth/*` passent par `authRateLimit` :

| Paramètre | Défaut | Description |
|-----------|--------|-------------|
| Fenêtre | 15 minutes | `windowMs: 15 * 60 * 1000` |
| Max requêtes / IP | 40 | `AUTH_RATE_LIMIT_MAX` |
| Désactivation | — | `AUTH_RATE_LIMIT_ENABLED=false` |

Réponse en cas de dépassement :

```json
{
  "code": "RATE_LIMITED",
  "message": "Trop de tentatives. Réessayez dans quelques minutes."
}
```

---

## 10. Codes d’erreur API

| Code | HTTP | Signification |
|------|------|---------------|
| `CAPTCHA_INVALID` | 403 | Token Turnstile invalide ou expiré |
| `CAPTCHA_TOKEN_MISSING` | — | Token absent (côté utilitaire turnstile.js) |
| `CAPTCHA_ERROR` | 500 | Erreur serveur lors de la vérification |
| `RATE_LIMITED` | 429 | Trop de requêtes sur `/api/auth/*` |

Messages localisés dans `src/utils/apiResponse.js` (fr, en, ar via header `Accept-Language`).

Côté Flutter, les clés ARB correspondantes existent dans `app_fr.arb`, `app_en.arb`, `app_ar.arb` (`errorCaptchaInvalid`, etc.).

---

## 11. Déploiement en production

### Checklist backend (`tranoo-api`)

- [ ] `TURNSTILE_SECRET_KEY` dans `.env` serveur
- [ ] `CAPTCHA_ENABLED=true` (ou variable absente)
- [ ] Redémarrer PM2 avec rechargement env :
  ```bash
  pm2 restart tranoo-api --update-env
  ```
- [ ] Vérifier les logs :
  ```bash
  pm2 logs tranoo-api --lines 30
  ```
  Attendu : `MongoDB connecté` sans `SyntaxError` ni erreur CAPTCHA au démarrage

### Checklist web (`tranoo_landing`)

- [ ] `NEXT_PUBLIC_TURNSTILE_SITE_KEY` dans `.env.local` ou variables d’environnement hébergeur
- [ ] `TURNSTILE_SECRET_KEY` (même valeur que backend)
- [ ] Hostname `tranoo.store` autorisé dans le dashboard Turnstile
- [ ] Rebuild + redéploiement Next.js

### Test manuel rapide

1. Ouvrir https://tranoo.store/login
2. Vérifier que le widget Turnstile s’affiche
3. Tenter une connexion sans valider le CAPTCHA → message « Veuillez valider le contrôle de sécurité »
4. Valider le CAPTCHA + se connecter → OK
5. Tester https://tranoo.store/inscription-agent-com de la même manière

### Test API inscription (curl)

```bash
curl -X POST https://api.tranoo.store/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPassword123!","nom":"Test"}'
```

Sans `captchaToken` → doit retourner `403` avec `CAPTCHA_INVALID` (si CAPTCHA activé).

---

## 12. Dépannage

| Symptôme | Cause probable | Solution |
|----------|----------------|----------|
| Widget Turnstile ne s’affiche pas | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` manquante ou mauvais build | Vérifier `.env.local`, rebuild Next.js |
| « CAPTCHA non configuré » sur la page | Site Key absente | Ajouter `NEXT_PUBLIC_TURNSTILE_SITE_KEY` |
| Erreur 403 CAPTCHA alors que le widget est validé | Secret Key incorrecte ou hostname non autorisé | Vérifier `TURNSTILE_SECRET_KEY` et hostnames Turnstile (`tranoo.store`, `localhost`) |
| CAPTCHA OK en local, KO en prod | Hostname prod non ajouté dans Turnstile | Ajouter `tranoo.store` dans le dashboard |
| Inscription mobile bloquée | `authApp` manquant ou incorrect | S’assurer que le body contient `authApp: "tranoo"` ou `"tranoo_pro"` |
| Bad Gateway 502 sur l’API | Backend crash au démarrage | `pm2 logs tranoo-api` — corriger l’erreur Node (ex. import dupliqué) |
| CAPTCHA ignoré en dev | Secret Key vide | Comportement normal ; ajouter les clés pour tester |

### Logs utiles

```bash
# Backend
pm2 logs tranoo-api --err

# Messages CAPTCHA backend
grep CAPTCHA /tmp/.pm2/logs/tranoo-api-error.log
```

---

## 13. Évolutions prévues

| Phase | Description | Fichiers |
|-------|-------------|----------|
| **Phase 2** | Activer CAPTCHA sur inscriptions mobile Flutter | `turnstile_captcha.dart`, `inscription_page.dart`, `verifyCaptcha.js` |
| **Phase 3** | Firebase App Check (couche supplémentaire) | `src/middlewares/verifyAppCheck.js` |

---

## Références

- [Cloudflare Turnstile — Documentation](https://developers.cloudflare.com/turnstile/)
- [Validation serveur Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)
- [Package react-turnstile](https://www.npmjs.com/package/@marsidev/react-turnstile)
- Fichiers exemple env : `.env.captcha.example`, `tranoo_landing/.env.example`

---

*Dernière mise à jour : juillet 2026 — Tranoo API / tranoo_landing*
