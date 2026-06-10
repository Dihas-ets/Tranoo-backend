# Documentation OpenAPI Tranoo

## Structure

```
src/docs/openapi/
  index.js          # Assemble la spec complète
  components.js     # Schémas partagés (ApiError, RegisterRequest, …)
  tags.js           # Catégories Swagger (une par domaine fonctionnel)
  helpers.js        # Utilitaires pour écrire les opérations
  paths/            # Un fichier par groupe de routes
    01-health-auth.js
    02-users-settings.js
    …
```

## Ajouter un nouvel endpoint

1. Créer la route dans `src/routes/` (comme d'habitude).
2. Monter la route dans `src/app.js` si nouveau préfixe.
3. **Documenter** dans le fichier `paths/` correspondant (ou en créer un nouveau).
4. Vérifier : `npm run swagger:verify`

### Exemple

```javascript
// src/docs/openapi/paths/02-users-settings.js
'/api/users/me/preferences': {
  get: authed('Utilisateurs', 'Mes préférences', { responses: { 200: OK } }),
},
```

## Consulter la doc

- UI : `http://localhost:PORT/api-docs`
- JSON : `http://localhost:PORT/api-docs.json`


* En Prod
https://api.tranoo.store/api-docs

## Tags (catégories)

Chaque opération doit utiliser un tag défini dans `tags.js`. Ne pas inventer de nouveaux tags sans les ajouter à `tags.js`.
