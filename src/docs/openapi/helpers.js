/** Helpers pour construire les opérations OpenAPI de façon concise et homogène. */

const ERR = { $ref: '#/components/schemas/ApiError' };
const OK = { description: 'Succès' };
const CREATED = { description: 'Ressource créée' };
const NO_CONTENT = { description: 'Succès sans contenu' };

const stdErrors = {
  400: { description: 'Requête invalide', content: { 'application/json': { schema: ERR } } },
  401: { description: 'Non authentifié', content: { 'application/json': { schema: ERR } } },
  403: { description: 'Accès refusé', content: { 'application/json': { schema: ERR } } },
  404: { description: 'Ressource introuvable', content: { 'application/json': { schema: ERR } } },
  409: { description: 'Conflit', content: { 'application/json': { schema: ERR } } },
  429: { description: 'Trop de requêtes', content: { 'application/json': { schema: ERR } } },
  500: { description: 'Erreur serveur', content: { 'application/json': { schema: ERR } } },
  503: { description: 'Service indisponible', content: { 'application/json': { schema: ERR } } },
};

const bearer = [{ bearerAuth: [] }];

function mergeResponses(...parts) {
  return Object.assign({}, stdErrors, ...parts);
}

function pathParam(name, description, type = 'string') {
  return { in: 'path', name, required: true, schema: { type }, description };
}

function queryParam(name, description, { required = false, type = 'string', enum: enumVals } = {}) {
  const schema = { type };
  if (enumVals) schema.enum = enumVals;
  return { in: 'query', name, required, schema, description };
}

function jsonBody(schemaRef, { required = true, description } = {}) {
  const body = {
    required,
    content: {
      'application/json': {
        schema: schemaRef ? { $ref: schemaRef } : { type: 'object', additionalProperties: true },
      },
    },
  };
  if (description) body.description = description;
  return body;
}

function multipartBody(description) {
  return {
    required: true,
    content: {
      'multipart/form-data': {
        schema: { type: 'object', additionalProperties: true },
      },
    },
    description,
  };
}

/**
 * @param {string} tag
 * @param {string} summary
 * @param {object} opts
 */
function op(tag, summary, opts = {}) {
  const {
    description,
    security,
    parameters,
    requestBody,
    responses,
    deprecated,
  } = opts;

  const operation = {
    tags: [tag],
    summary,
    responses: mergeResponses(responses),
  };

  if (description) operation.description = description;
  if (security !== undefined) operation.security = security;
  if (parameters?.length) operation.parameters = parameters;
  if (requestBody) operation.requestBody = requestBody;
  if (deprecated) operation.deprecated = true;

  return operation;
}

function authed(tag, summary, opts = {}) {
  return op(tag, summary, { ...opts, security: bearer });
}

module.exports = {
  bearer,
  OK,
  CREATED,
  NO_CONTENT,
  stdErrors,
  mergeResponses,
  pathParam,
  queryParam,
  jsonBody,
  multipartBody,
  op,
  authed,
};
