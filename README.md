# API Webhook - Integración entre Sistemas

## Descripción

Integración entre dos sistemas independientes vía API REST y Webhooks:

- **Sistema A (Gestor de Documentos)**: Crea y envía documentos para revisión
- **Sistema B (Plataforma de Firma - Mock)**: Recibe documentos y devuelve decisiones (aprobado/rechazado)

## Stack Tecnológico

- **Runtime/Lenguaje**: Node.js + TypeScript
- **Framework HTTP**: Express v5
- **ORM / DB**: Drizzle ORM + PostgreSQL
- **Validación**: Zod
- **Testing**: Vitest + Supertest
- **Tiempo real**: Socket.IO
- **Autenticación de webhook**: HMAC-SHA256

## Estructura del Proyecto

```
├── db/
│   ├── schema.ts          # Modelos de base de datos (Drizzle)
│   ├── connection.ts      # Conexión a PostgreSQL
│   └── index.ts           # Exportaciones
├── src/
│   ├── server.ts          # Punto de entrada del servidor
│   ├── routes/
│   │   ├── documents.ts   # Rutas de documentos (POST /documents)
│   │   ├── webhooks.ts    # Webhook entrante (POST /webhooks/absign)
│   │   └── reconciliation.ts  # Reconciliación (GET /documents/:id/status)
│   └── lib/
│       ├── hmac.ts        # Verificación HMAC-SHA256
│       ├── zodSchemas.ts  # Esquemas de validación
│       ├── dbOperations.ts# Operaciones de base de datos
│       └── socket.ts      # Configuración de Socket.IO
├── tests/
├── docs/
│   ├── architecture/
│   └── stories/
├── .env                   # Variables de entorno
├── .env.example           # Ejemplo de variables de entorno
├── drizzle.config.ts      # Configuración de Drizzle Kit
├── vitest.config.ts       # Configuración de Vitest
├── tsconfig.json          # Configuración de TypeScript
└── package.json
```

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el archivo de configuración local
cp .env.example .env

# 3. Configurar la base de datos en .env
# DATABASE_URL=postgresql://user:password@localhost:5432/api_webhook

# 4. Crear tablas en PostgreSQL
npm run db:push

# 5. (Opcional) Abrir Drizzle Studio para ver la DB
npm run db:studio
```

## Scripts Disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Inicia el servidor en modo desarrollo |
| `npm run build` | Compila TypeScript a JavaScript |
| `npm start` | Inicia el servidor en producción |
| `npm run db:generate` | Genera migraciones de Drizzle |
| `npm run db:migrate` | Aplica migraciones a la base de datos |
| `npm run db:push` | Empuja el schema a la base de datos |
| `npm run db:studio` | Abre Drizzle Studio (UI de base de datos) |
| `npm test` | Ejecuta las pruebas |
| `npm run demo` | Empuja la DB e inicia el servidor |

## Endpoints

### Sistema A → Sistema B

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/documents` | Crea un documento y lo marca como enviado a Sistema B. `documentId` es opcional; si no se proporciona, se genera uno automático. |
| `POST` | `/documents/:id/simulate-webhook` | Simula un webhook entrante para el documento especificado, firmando el payload con HMAC. |

### Webhook Entrante (Sistema B → Sistema A)

| Método | Endpoint | Descripción |
|---|---|---|
| `POST` | `/webhooks/absign` | Recibe la decisión del webhook (approved/rejected), valida la firma HMAC y actualiza el estado del documento. |

### Reconciliación

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/documents/:id/status` | Consulta el estado de un documento y su historial de eventos. |
| `GET` | `/documents` | Lista documentos con paginación y filtro opcional por `status`. |

### Health Check

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/health` | Verifica que el servidor está funcionando. |

## Detalles de uso

### POST /documents

Payload:
```json
{
  "documentId": "opcional-id-123",
  "thirdPartyEmail": "cliente@example.com",
  "fileUrl": "https://example.com/documento.pdf",
  "callbackUrl": "http://localhost:3000/webhooks/absign"
}
```

- `documentId` es opcional.
- Si se envía un `documentId` que ya existe, el servidor responde con `409 Conflict`.
- En respuesta se retorna el documento creado con `status: sent`.

### POST /documents/:id/simulate-webhook

Payload:
```json
{
  "status": "approved",
  "reason": "Motivo de la aprobación"
}
```

- Este endpoint utiliza `callbackUrl` registrado en el documento para enviar el webhook.
- El webhook simulado incluye `signature` en el body y en la cabecera `X-Signature`.

### POST /webhooks/absign

Requiere cabecera `X-Signature` con la firma HMAC-SHA256 del payload sin la propiedad `signature`.

Payload esperado:
```json
{
  "documentId": "opcional-id-123",
  "status": "approved",
  "reason": "Mensaje opcional",
  "timestamp": "2026-07-21T12:00:00.000Z",
  "signature": "..."
}
```

- Valida la firma y actualiza el documento a `approved` o `rejected`.
- Retorna `401` si la firma es inválida.

### GET /documents

Soporta query params:
- `limit` (default `20`, máximo `100`)
- `offset` (default `0`)
- `status` (`pending`, `sent`, `approved`, `rejected`)

Ejemplo:
`GET /documents?limit=10&offset=0&status=sent`

## Diagrama de Secuencia

```mermaid
sequenceDiagram
    participant U as Usuario
    participant A as Sistema A
    participant DB as PostgreSQL
    participant B as Sistema B (Mock)
    participant S as Socket.IO

    U->>A: POST /documents
    A->>DB: INSERT documento (pending)
    DB-->>A: Documento creado
    A->>B: HTTP POST (simulado)
    B-->>A: 200 OK
    A->>DB: UPDATE status = sent
    A-->>U: 201 Documento enviado

    Note over B: Tiempo después...

    B->>A: POST /webhooks/absign
    A->>A: Verificar HMAC-SHA256
    alt Firma válida
        A->>DB: INSERT webhook_event (processed)
        A->>DB: UPDATE status = approved|rejected
        A->>S: Emit document:statusChanged
        S-->>Cliente: WebSocket event
        A-->>B: 200 Procesado
    else Firma inválida
        A-->>B: 401 No autorizado
    end
```

## Variables de Entorno

| Variable | Descripción | Ejemplo |
|---|---|---|
| `DATABASE_URL` | URL de conexión a PostgreSQL | `postgresql://postgres:postgres@localhost:5432/api_webhook` |
| `PORT` | Puerto del servidor HTTP | `3000` |
| `HMAC_SECRET` | Secreto compartido para firma HMAC | `tu-secreto-aqui` |
| `NODE_ENV` | Entorno de ejecución | `development` / `production` |
| `SOCKET_IO_PORT` | Puerto de Socket.IO | `3001` |

## Ejemplo de `.env`

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/api_webhook
HMAC_SECRET=mi_secreto_super_secreto_123
SOCKET_IO_PORT=3001
```

## Justificación de Decisiones de Diseño

### ¿Por qué HMAC-SHA256?

HMAC-SHA256 es el estándar para autenticación de webhooks porque:
1. **Verifica integridad**: Cualquier modificación del payload invalida la firma
2. **Verifica autenticidad**: Solo sistemas con el secreto compartido pueden firmar
3. **Timing-safe**: La comparación `crypto.timingSafeEqual` previene ataques de timing
4. **Sin dependencias externas**: Usa el módulo `crypto` nativo de Node.js

### ¿Cómo se resuelve la idempotencia?

La idempotencia se resuelve mediante la tabla `webhook_events`:
1. Cada webhook registrado tiene un `documentId` + `status`
2. Antes de procesar, se verifica si ya existe un evento procesado para ese documento y estado
3. Si ya existe, se retorna 200 sin efectos secundarios (respuesta idempotente)
4. En producción, se usaría un `UNIQUE CONSTRAINT` en `(document_id, status)` a nivel de base de datos

### ¿Qué se haría en producción real?

1. **Colas de mensajes**: Usar RabbitMQ o AWS SQS para desacoplar envío de webhooks
2. **Retries con backoff exponencial**: 1s, 5s, 30s, 5min, 15min
3. **Dead-letter queue**: Webhooks que fallan después de N intentos van a una cola de muerte
4. **Rate limiting**: Limitar solicitudes entrantes por IP o documento
5. **Monitoreo**: Metrics de latencia, tasa de errores, webhooks pendientes
6. **TLS obligatorio**: HTTPS para toda comunicación
7. **Rotación de secretos**: Cambio periódico del HMAC_SECRET

## Criterios de Evaluación

| Criterio | Estado |
|---|---|
| Separación correcta API saliente vs. webhook entrante | ✅ |
| Seguridad del webhook (verificación HMAC) | ✅ |
| Idempotencia y manejo de duplicados | ✅ |
| Modelo de datos y migraciones con Drizzle | ✅ |
| Notificación en tiempo real con Socket.IO | ✅ |
| Pruebas automatizadas | 🚧 En progreso |
| Documentación y diagrama de flujo | ✅ |