import swaggerJsdoc from 'swagger-jsdoc'

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Vendix API',
      version: '1.0.0',
      description: 'API REST para integrar tu e-commerce o sistema externo con Vendix. Todas las rutas (excepto /auth) requieren un Bearer token JWT obtenido desde POST /auth/login.',
      contact: { name: 'Vendix Support', email: 'support@vendix.app' },
    },
    servers: [
      { url: 'http://localhost:3001/api', description: 'Desarrollo local' },
      { url: 'https://api.vendix.app/api', description: 'Producción' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Token obtenido desde POST /auth/login',
        },
      },
      schemas: {
        Product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            price: { type: 'number' },
            cost: { type: 'number' },
            quantity: { type: 'integer' },
            barcode: { type: 'string', nullable: true },
            taxExempt: { type: 'boolean' },
            businessId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['SALE', 'EXPENSE', 'INCOME', 'PURCHASE', 'RETURN'] },
            amount: { type: 'number' },
            status: { type: 'string', enum: ['COMPLETED', 'PENDING', 'CANCELLED'] },
            paymentMethod: { type: 'string', enum: ['CASH', 'CARD', 'TRANSFER'] },
            ncfNumber: { type: 'string', nullable: true },
            originalCurrency: { type: 'string', nullable: true },
            exchangeRate: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Client: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            phone: { type: 'string', nullable: true },
            email: { type: 'string', nullable: true },
            isVip: { type: 'boolean' },
            discountRate: { type: 'number', description: 'Porcentaje de descuento (0.0 - 1.0)' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Autenticación y gestión de usuarios' },
      { name: 'Products', description: 'Inventario y productos' },
      { name: 'Transactions', description: 'Ventas, gastos y movimientos' },
      { name: 'Clients', description: 'Clientes y cuentas por cobrar' },
      { name: 'Stats', description: 'Estadísticas y reportes' },
      { name: 'Billing', description: 'Suscripciones y pagos' },
    ],
  },
  apis: ['./src/routes/*.ts'],
})
