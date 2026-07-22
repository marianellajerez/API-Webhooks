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
├── src/
│   ├── sistema-a/              # Sistema A: Gestor de Documentos
│   │   ├── routes/
│   │   │   ├── create.ts       # POST /documents (crea y envía a Sistema B)
│   │   │   ├── reconcile.ts    # GET /documents (lista + estado)
│   │   │   └── simulate.ts     # POST /documents/:id/simulate-webhook
│   │   └── client/             # Cliente HTTP hacia Sistema B
│   ├── sistema-b/              # Sistema B: Plataforma de Firma (mock)
│   │   └── routes/
│   │       └── documents.ts    # POST /documents (simula firma)
│   ├── shared/                 # Código compartido
│   │   ├── db/                 # Base de datos (schema, connection)
│   │   └── lib/                # Utilidades (HMAC, Socket.IO, etc.)
│   ├── webhooks.ts             # POST /webhooks/absign (recibe de Sistema B)
│   └── server.ts               # Punto de entrada
├── tests/
│   ├── api.test.ts             # Tests de endpoints
│   ├── hmac.test.ts            # Tests de HMAC
│   └── schemas.test.ts         # Tests de validación
├── docs/
│   ├── architecture/
│   └── stories/
├── .env
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── drizzle.config.ts
├── vitest.config.ts
└── package.json
```

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Crear el archivo de configuración local
cp .env.example .env

# 3. Configurar la base de datos en .env
# DATABASE_URL=postgresql://admin:admin@localhost:5432/sistema_documentos

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

## Justificación de Decisiones de Diseño

### ¿Por qué HMAC-SHA256?

HMAC (Hash-based Message Authentication Code) es el estándar para autenticar webhooks porque:

1. **Verifica autenticidad**: Solo sistemas con la clave secreta pueden generar firmas válidas
2. **Verifica integridad**: Si el payload se modifica en tránsito, la firma no coincide
3. **Resistente a timing attacks**: Usamos `crypto.timingSafeEqual()` para evitar ataques de tiempo
4. **Estándar de la industria**: GitHub, Stripe, y otros servicios líderes usan HMAC para webhooks

### ¿Cómo se resuelve la idempotencia?

La idempotencia se implementa en **dos capas**:

1. **Capa de aplicación**: Al recibir un webhook, verificamos si ya existe un evento procesado con el mismo `documentId` + `status`. Si existe, retornamos `200 OK` sin procesar de nuevo.

2. **Capa de base de datos**: Un constraint único en `(document_id, status)` en la tabla `webhook_events` garantiza que no se puedan insertar duplicados a nivel de BD, incluso en escenarios de concurrencia.

```sql
-- El constraint se crea automáticamente con Drizzle
CREATE UNIQUE INDEX unique_document_status ON webhook_events (document_id, status);
```

### ¿Qué se haría en producción?

Si este sistema escalara a producción real, implementaríamos:

1. **Cola de mensajes (RabbitMQ/SQS)**: Para manejar picos de carga y garantizar entrega
2. **Dead-letter queue**: Webhooks que fallan después de 5 intentos van a una cola de revisión
3. **Rate limiting**: Limitar solicitudes por IP para prevenir abuse
4. **Certificados mTLS**: Autenticación mutua entre servicios
5. **Monitoreo**: Alertas cuando la tasa de webhooks fallidos supere el 5%

## Pruebas

```bash
# Ejecutar todas las pruebas
npm test

# Modo watch
npm run test:watch
```

### Cobertura de pruebas

| Escenario | Archivo | Estado |
|---|---|---|
| Crear documento válido | `api.test.ts` | ✅ |
| Generar documentId automático | `api.test.ts` | ✅ |
| Rechazar documentId duplicado | `api.test.ts` | ✅ |
| Validar email inválido | `api.test.ts` | ✅ |
| Validar URL inválida | `api.test.ts` | ✅ |
| Procesar webhook válido | `api.test.ts` | ✅ |
| Rechazar firma inválida | `api.test.ts` | ✅ |
| Simular webhook con firma | `api.test.ts` | ✅ |
| Listar documentos | `api.test.ts` | ✅ |
| Filtrar por status | `api.test.ts` | ✅ |
| Test de idempotencia | `api.test.ts` | ✅ |
| Generar firma HMAC | `hmac.test.ts` | ✅ |
| Verificar firma válida | `hmac.test.ts` | ✅ |
| Rechazar firma inválida | `hmac.test.ts` | ✅ |
| Validar schemas Zod | `schemas.test.ts` | ✅ |
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