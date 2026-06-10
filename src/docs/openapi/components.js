/** Schémas et composants OpenAPI partagés. */

module.exports = {
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Firebase ID token (header Authorization: Bearer …)',
    },
  },
  schemas: {
    ApiError: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        code: {
          type: 'string',
          example: 'OTP_EXPIRED',
          description: 'Code stable traduit côté mobile',
        },
        message: {
          type: 'string',
          example: 'Code expiré. Redemandez un code.',
          description: 'Message français (rétrocompatibilité)',
        },
        blocked: { type: 'boolean' },
        blockedAt: { type: 'string', format: 'date-time' },
      },
    },
    ApiSuccess: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string' },
      },
    },
    RegisterRequest: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 6 },
        role: {
          type: 'string',
          enum: [
            'acheteur',
            'vendeur',
            'livreur',
            'chauffeur',
            'transitaire',
            'agentCommercial',
            'admin',
          ],
        },
        telephone: { type: 'string' },
        nom: { type: 'string' },
        prenom: { type: 'string' },
        countryCode: { type: 'string', example: '+229' },
        nationalNumber: { type: 'string' },
        app: { type: 'string', enum: ['tranoo', 'tranoo_pro'] },
        referralCode: { type: 'string' },
        fcmToken: { type: 'string' },
      },
    },
    WebSessionStart: {
      type: 'object',
      properties: {
        clientInfo: { type: 'string' },
      },
    },
    PasswordResetRequest: {
      type: 'object',
      required: ['telephone', 'app'],
      properties: {
        telephone: { type: 'string', example: '22959312345' },
        countryCode: { type: 'string', example: '+229' },
        nationalNumber: { type: 'string', example: '59312345' },
        app: { type: 'string', enum: ['tranoo', 'tranoo_pro'] },
        fcmToken: { type: 'string', description: 'Token FCM optionnel (fallback push)' },
      },
    },
    VerifyResetCode: {
      type: 'object',
      required: ['requestId', 'deviceId', 'code'],
      properties: {
        requestId: { type: 'string' },
        deviceId: { type: 'string' },
        code: { type: 'string', example: '123456' },
      },
    },
    ResetPassword: {
      type: 'object',
      required: ['requestId', 'deviceId', 'newPassword'],
      properties: {
        requestId: { type: 'string' },
        deviceId: { type: 'string' },
        newPassword: { type: 'string', minLength: 6 },
      },
    },
    UserSettings: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['fr', 'en', 'ar'] },
        currency: { type: 'string', example: 'XOF' },
        notifications: { type: 'object', additionalProperties: true },
      },
    },
    ArticleInput: {
      type: 'object',
      properties: {
        titre: { type: 'string' },
        description: { type: 'string' },
        prix: { type: 'number' },
        categorie: { type: 'string' },
        images: { type: 'array', items: { type: 'string' } },
        stock: { type: 'integer' },
        statut: { type: 'string' },
      },
    },
    OrderInput: {
      type: 'object',
      properties: {
        articleId: { type: 'string' },
        quantity: { type: 'integer' },
        deliveryAddress: { type: 'object', additionalProperties: true },
        paymentMethod: { type: 'string' },
      },
    },
    DeliveryInput: {
      type: 'object',
      properties: {
        orderId: { type: 'string' },
        pickupAddress: { type: 'object', additionalProperties: true },
        deliveryAddress: { type: 'object', additionalProperties: true },
      },
    },
    ChatMessage: {
      type: 'object',
      properties: {
        roomId: { type: 'string' },
        content: { type: 'string' },
        type: { type: 'string', enum: ['text', 'image', 'file'] },
      },
    },
    GeoPoint: {
      type: 'object',
      properties: {
        lat: { type: 'number' },
        lng: { type: 'number' },
      },
    },
    PaginationQuery: {
      type: 'object',
      properties: {
        page: { type: 'integer', default: 1 },
        limit: { type: 'integer', default: 20 },
      },
    },
  },
};
