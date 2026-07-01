# CAPTCHA Tranoo — Cloudflare Turnstile (web + backend)

> **Périmètre actuel : web (`tranoo_landing`) + API Express.**  
> Le CAPTCHA mobile Flutter est préparé mais **commenté** — à réactiver plus tard.

## 1. Créer les clés (gratuit)

1. [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile)
2. **Hostname(s)** à renseigner :

| Environnement | Domaine à mettre |
|---------------|------------------|
| Dev local | `localhost` |
| Production | `tranoo.store` |

**Important :** c’est le domaine **où s’affiche le widget** (le site web), **pas** `api.tranoo.store`.

- `tranoo.store` → pages `/login`, `/inscription-agent-com`
- `api.tranoo.store` → **ne pas** mettre (pas de widget Turnstile côté API)

Si le dashboard admin est sur un sous-domaine (ex. `admin.tranoo.store`), ajoute-le aussi.

3. Récupérer **Site Key** (public) et **Secret Key** (privée)

## 2. Configuration

### Web (`tranoo_landing/.env.local`)

```env
NEXT_PUBLIC_TURNSTILE_SITE_KEY=votre_site_key
TURNSTILE_SECRET_KEY=votre_secret_key
```

### Backend (`/.env`)

```env
TURNSTILE_SECRET_KEY=votre_secret_key
CAPTCHA_ENABLED=true
```

La **même Secret Key** sert à vérifier les tokens côté Next.js (`/api/captcha/verify`) et côté Express (`/auth/register`).

### Flutter (désactivé pour l’instant)

Fichiers conservés mais non utilisés :
- `tranoo/lib/utils/turnstile_captcha.dart`
- `tranoo_pro/lib/utils/turnstile_captcha.dart`

## 3. Points protégés (web)

| Zone | Protection |
|------|------------|
| `/login` | Turnstile → `/api/captcha/verify` → Firebase |
| `/inscription-agent-com` | Turnstile + `captchaToken` sur `/auth/register` |
| `POST /auth/register` (sans `authApp`) | Middleware `verifyCaptcha` |
| Admin crée un user (dashboard) | Exempté (admin authentifié) |
| Inscription app mobile (`authApp`) | Exemptée (CAPTCHA mobile à venir) |

## 4. Rate limiting

`/api/auth/*` : 40 requêtes / 15 min par IP (configurable via `AUTH_RATE_LIMIT_MAX`).

## 5. Mode dev sans clés

Sans `TURNSTILE_SECRET_KEY`, la vérification est ignorée (logs warning).

```env
CAPTCHA_ENABLED=false
```

## 6. Firebase App Check (optionnel, plus tard)

Voir `src/middlewares/verifyAppCheck.js` et la doc Firebase App Check.
