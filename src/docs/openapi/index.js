const fs = require('fs');
const path = require('path');
const components = require('./components');
const tags = require('./tags');

/**
 * Charge et fusionne tous les fichiers paths/*.js
 * Ajouter un nouveau fichier dans paths/ pour documenter un nouveau domaine.
 */
function loadPaths() {
  const pathsDir = path.join(__dirname, 'paths');
  const files = fs
    .readdirSync(pathsDir)
    .filter((f) => f.endsWith('.js'))
    .sort();

  return files.reduce((acc, file) => {
    const mod = require(path.join(pathsDir, file));
    return Object.assign(acc, mod);
  }, {});
}

function buildOpenApiSpec() {
  return {
    openapi: '3.0.0',
    info: {
      title: 'Tranoo API',
      version: '1.0.0',
      description: [
        'Documentation complète de l\'API backend Tranoo.',
        '',
        '**Maintenir à jour** : chaque nouvel endpoint doit être ajouté dans `src/docs/openapi/paths/`.',
        'Vérifier avec `npm run swagger:verify`.',
        '',
        '**Auth** : Firebase ID token via `Authorization: Bearer <token>`.',
        '**Session web** : headers `X-Client-Platform: web` et `X-Web-Session-Id`.',
      ].join('\n'),
      contact: { name: 'Tranoo' },
    },
    servers: [{ url: '/', description: 'Serveur courant' }],
    tags,
    components,
    paths: loadPaths(),
  };
}

module.exports = { buildOpenApiSpec, loadPaths };
