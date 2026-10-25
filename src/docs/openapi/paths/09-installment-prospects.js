const { op, OK } = require('../helpers');

module.exports = {
  '/api/prospects/installment-payment-stats': {
    get: op('Prospects paiement échelonné', 'Consulter les statistiques paiement échelonné', {
      description:
        'Retourne le total de clics, le nombre d’utilisateurs marqués prospect=true et une page de prospects. Réservé aux administrateurs autorisés.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'page',
          schema: { type: 'integer', minimum: 1, default: 1 },
        },
        {
          in: 'query',
          name: 'limit',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
        },
        {
          in: 'query',
          name: 'search',
          schema: { type: 'string' },
        },
      ],
      responses: {
        200: {
          ...OK,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  totalClics: { type: 'integer' },
                  totalProspects: { type: 'integer' },
                  totalFiltered: { type: 'integer' },
                  page: { type: 'integer' },
                  limit: { type: 'integer' },
                  totalPages: { type: 'integer' },
                  prospects: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        _id: { type: 'string' },
                        nom: { type: 'string' },
                        prenoms: { type: 'string' },
                        email: { type: 'string' },
                        telephone: { type: 'string' },
                        dateInscription: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  },
  '/api/prospects/installment-payment-click': {
    post: op('Prospects paiement échelonné', 'Enregistrer un clic paiement échelonné', {
      description:
        'Incrémente le compteur global à chaque clic. Si un jeton Firebase est fourni, marque prospect=true pour l’utilisateur correspondant.',
      security: [{}, { bearerAuth: [] }],
      responses: {
        200: {
          ...OK,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                  totalClics: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    }),
  },
  '/api/prospects/installment-payment-interest': {
    post: op('Prospects paiement échelonné', 'Marquer un utilisateur intéressé', {
      description:
        'Marque prospect=true pour l’utilisateur authentifié sans incrémenter le compteur global des clics.',
      responses: { 200: OK },
    }),
  },
};
