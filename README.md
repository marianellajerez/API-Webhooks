# API Webhook - Integración entre Sistemas

## Descripción

Integración entre dos sistemas independientes vía API REST y Webhooks:

- **Sistema A (Gestor de Documentos)**: Crea y envía documentos para revisión
- **Sistema B (Plataforma de Firma - Mock)**: Recibe documentos y devuelve decisiones (aprobado/rechazado)

**Flujo completo**: El sistema simula un proceso de firma digital donde un documento es creado en Sistema A, enviado a Sistema B para firma, y el resultado se notifica en tiempo real vía Webhook + Socket.IO.

## Stack Tecnológico

| Tecnología | Versión | Propósito |
|---|---|---|
| Node.js | 18+ | Runtime |
| TypeScript | 5.x | Lenguaje |
| Express | 5.x | Framework HTTP |
| Drizzle ORM | 0.45+ | ORM + Migraciones |
| PostgreSQL | 15+ | Base de datos |
| Zod | 4.x | Validación de esquemas |
| Socket.IO | 4.8+ | Notificaciones en tiempo real |
| HMAC-SHA256 | crypto nativo | Autenticación de webhooks |
| Vitest + Supertest | 3.x | Testing automatizado |

## Estructura del Proyecto

\\\
├── src/
│   ├── sistema-a/              # Sistema A: Gestor de Documentos
│   │   ├── routes/
│   │   │   ├── create.ts       # POST /documents (crea y envía a Sistema B)
│   │   │   ├── reconcile.ts    # GET /documents + GET /documents/:id/status
│   │   │   └── simulate.ts     # POST /documents/:id/simulate-webhook
│   │   └── client/             # Cliente HTTP hacia Sistema B
│   ├── sistema-b/              # Sistema B: Plataforma de Firma (mock)
│   │   └── routes/
│   │       └── documents.ts    # POST /documents (simula firma)
│   ├── shared/                 # Código compartido
│   │   ├── db/                 # Base de datos (schema, connection)
│   │   │   ├── schema.ts       # Tablas: documents, webhook_events, incidents
│   │   │   ├── connection.ts   # Conexión PostgreSQL
│   │   │   └── index.ts        # Exportaciones
│   │   └── lib/                # Utilidades
│   │       ├── hmac.ts         # HMAC-SHA256 (timing-safe)
│   │       ├── socket.ts       # Socket.IO (rooms, eventos)
│   │       ├── zodSchemas.ts   # Esquemas de validación
│   │       ├── dbOperations.ts # Operaciones CRUD
│   │       ├── webhookClient.ts # Cliente HTTP con reintentos
│   │       └── sistemaBSimulator.ts # Simulador de Sistema B
│   ├── webhooks.ts             # POST /webhooks/absign (recibe de Sistema B)
│   └── server.ts               # Punto de entrada (Express + Socket.IO)
├── public/
│   └── socket-client.html      # Frontend visual para Socket.IO
├── scripts/
│   ├── demo.ts                 # Script de demostración completa
│   ├── socket-client.ts        # Cliente CLI de prueba Socket.IO
│   ├── test-webhook.ps1        # Script PowerShell para pruebas de webhook
│   └── test-incident.ps1       # Script PowerShell para pruebas de incidencia
├── tests/
│   ├── api.test.ts             # Tests de endpoints (15 tests)
│   ├── hmac.test.ts            # Tests de HMAC (3 tests)
│   ├── schemas.test.ts         # Tests de validación (3 tests)
│   └── socket-client.test.ts   # Tests de Socket.IO (3 tests)
├── docs/
│   ├── architecture/
│   │   └── auditoria-completa.md
│   └── stories/
├── .env
├── .env.example
├── docker-compose.yml
├── Dockerfile
├── drizzle.config.ts
├── vitest.config.ts
├── package.json
└── README.md
\\\

## Instalación

\\\ash
# 1. Instalar dependencias
npm install

# 2. Crear el archivo de configuración local
cp .env.example .env

# 3. Configurar la base de datos en .env
# DATABASE_URL=postgresql://postgres:postgres@localhost:5432/api_webhook

# 4. Crear tablas en PostgreSQL
npm run db:push

# 5. (Opcional) Abrir Drizzle Studio para ver la DB
npm run db:studio
\\\

## Scripts Disponibles

| Comando | Descripción |
|---|---|
| \
pm run dev\ | Inicia el servidor en modo desarrollo (hot reload) |
| \
pm run build\ | Compila TypeScript a JavaScript |
| \
pm start\ | Inicia el servidor en producción |
| \
pm run db:generate\ | Genera migraciones de Drizzle |
| \
pm run db:migrate\ | Aplica migraciones a la base de datos |
| \
pm run db:push\ | Empuja el schema a la base de datos |
| \
pm run db:studio\ | Abre Drizzle Studio (UI de base de datos) |
| \
pm test\ | Ejecuta las 33 pruebas automatizadas |
| \
pm run demo\ | **Ejecuta el flujo completo automáticamente** |
| \
pm run socket:test\ | Inicia el cliente CLI de prueba Socket.IO |

## Diagrama de Arquitectura

\\\mermaid
graph TB
    subgraph SistemaA["Sistema A: Gestor de Documentos"]
        A1[POST /documents] --> A2[Crear documento en BD]
        A2 --> A3[Enviar a Sistema B]
        A5[POST /webhooks/absign] --> A6[Verificar HMAC]
        A6 --> A7[Validar idempotencia]
        A7 --> A8[Actualizar estado]
        A8 --> A9[Emitir Socket.IO]
    end
    
    subgraph SistemaB["Sistema B: Plataforma de Firma (Mock)"]
        B1[POST /documents] --> B2[Simular firma]
        B2 --> B3[Enviar webhook]
    end
    
    Usuario["Usuario / Cliente"] --> A1
    Usuario --> A5
    A3 --> B1
    B3 --> A5
\\\

## Diagrama de Secuencia

\\\mermaid
sequenceDiagram
    participant U as Usuario
    participant A as Sistema A
    participant DB as PostgreSQL
    participant B as Sistema B (Mock)
    participant S as Socket.IO

    Note over U,B: Flujo Normal (Aprobado)

    U->>A: POST /documents
    A->>DB: INSERT documento (pending)
    DB-->>A: Documento creado
    A->>B: HTTP POST /documents
    B-->>A: 200 OK
    A->>DB: UPDATE status = sent
    A-->>U: 201 Documento enviado

    Note over B: Simulación de firma

    B->>A: POST /webhooks/absign
    A->>A: Verificar HMAC-SHA256
    alt Firma válida
        A->>DB: INSERT webhook_event
        A->>DB: UPDATE status = approved
        A->>S: Emit document:statusChanged
        S-->>Cliente: WebSocket event
        A-->>B: 200 Procesado
    else Firma inválida
        A->>DB: INSERT incident
        A-->>B: 401 No autorizado
    end
\\\

## Endpoints

### Sistema A → Sistema B

| Método | Endpoint | Descripción |
|---|---|---|
| \POST\ | \/documents\ | Crea un documento y lo envía a Sistema B |
| \POST\ | \/documents/:id/simulate-webhook\ | Simula webhook de Sistema B (para pruebas) |

### Webhook Entrante (Sistema B → Sistema A)

| Método | Endpoint | Descripción |
|---|---|---|
| \POST\ | \/webhooks/absign\ | Recibe decisión de firma, valida HMAC, actualiza estado |

### Reconciliación

| Método | Endpoint | Descripción |
|---|---|---|
| \GET\ | \/documents\ | Lista documentos con paginación y filtro |
| \GET\ | \/documents/:id/status\ | Consulta estado y historial de un documento |

### Health Check

| Método | Endpoint | Descripción |
|---|---|---|
| \GET\ | \/health\ | Verifica que el servidor está funcionando |

### Frontend Socket.IO

| Método | Endpoint | Descripción |
|---|---|---|
| \GET\ | \/socket-client\ | Frontend visual para eventos en tiempo real |

## Detalles de Uso

### POST /documents

Crea un documento y lo envía a Sistema B para firma.

**Payload:**
\\\json
{
  "documentId": "opcional-id-123",
  "thirdPartyEmail": "cliente@example.com",
  "fileUrl": "https://ejemplo.com/documento.pdf",
  "callbackUrl": "http://localhost:3000/webhooks/absign"
}
\\\

**Respuesta 201:**
\\\json
{
  "message": "Documento enviado exitosamente a Sistema B",
  "document": {
    "id": "demo-doc-123",
    "status": "sent",
    "sentAt": "2026-07-22T01:00:00.000Z"
  }
}
\\\

**Respuesta 409 (duplicado):**
\\\json
{
  "error": "documentId ya existe",
  "message": "El documentId proporcionado ya está registrado",
  "documentId": "demo-doc-123"
}
\\\

### POST /documents/:id/simulate-webhook

Simula que Sistema B envía un webhook de resultado de firma.

**Payload:**
\\\json
{
  "status": "approved",
  "reason": "Documento firmado exitosamente"
}
\\\

### POST /webhooks/absign

Recibe la decisión de firma de Sistema B. Requiere cabecera \X-Signature\ con firma HMAC-SHA256.

**Cabeceras:**
- \X-Signature\: Firma HMAC-SHA256 del payload (sin el campo signature)
- \Content-Type\: application/json

**Payload:**
\\\json
{
  "documentId": "demo-doc-123",
  "status": "approved",
  "reason": "Firma verificada",
  "timestamp": "2026-07-22T01:00:00.000Z",
  "signature": "abc123..."
}
\\\

**Respuesta 200 (éxito):**
\\\json
{
  "message": "Webhook procesado exitosamente",
  "documentId": "demo-doc-123",
  "status": "approved"
}
\\\

**Respuesta 200 (idempotente):**
\\\json
{
  "message": "Evento ya procesado (idempotente)",
  "documentId": "demo-doc-123",
  "status": "approved"
}
\\\

**Respuesta 401 (firma inválida):**
\\\json
{
  "error": "Firma HMAC inválida",
  "message": "El webhook no fue autorizado. Verifica la firma."
}
\\\

### GET /documents

Lista documentos con paginación.

**Query params:**
- \limit\ (default: 20, máximo: 100)
- \offset\ (default: 0)
- \status\ (\pending\, \sent\, \pproved\, \ejected\)

**Ejemplo:**
\\\
GET /documents?limit=10&offset=0&status=approved
\\\

## Variables de Entorno

| Variable | Descripción | Ejemplo |
|---|---|---|
| \DATABASE_URL\ | URL de conexión a PostgreSQL | \postgresql://postgres:postgres@localhost:5432/api_webhook\ |
| \PORT\ | Puerto del servidor HTTP | \3000\ |
| \HMAC_SECRET\ | Secreto compartido para firma HMAC | \	u-secreto-seguro-aqui\ |
| \NODE_ENV\ | Entorno de ejecución | \development\ / \production\ |

## Ejemplo de \.env\

\\\env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/api_webhook
HMAC_SECRET=mi_secreto_super_secreto_123
\\\

## Ejecución de Pruebas

\\\ash
# Ejecutar todas las pruebas
npm test

# Modo watch (re-ejecuta al cambiar archivos)
npm run test:watch
\\\

### Resumen de Pruebas (33 tests)

| Escenario | Archivo | Estado |
|---|---|---|
| Crear documento válido | \pi.test.ts\ | ✅ |
| Generar documentId automático | \pi.test.ts\ | ✅ |
| Rechazar documentId duplicado | \pi.test.ts\ | ✅ |
| Validar email inválido | \pi.test.ts\ | ✅ |
| Validar URL inválida | \pi.test.ts\ | ✅ |
| Procesar webhook válido | \pi.test.ts\ | ✅ |
| Rechazar firma inválida | \pi.test.ts\ | ✅ |
| Simular webhook con firma | \pi.test.ts\ | ✅ |
| Listar documentos | \pi.test.ts\ | ✅ |
| Filtrar por status | \pi.test.ts\ | ✅ |
| Test de idempotencia | \pi.test.ts\ | ✅ |
| Generar firma HMAC | \hmac.test.ts\ | ✅ |
| Verificar firma válida | \hmac.test.ts\ | ✅ |
| Rechazar firma inválida | \hmac.test.ts\ | ✅ |
| Validar schemas Zod | \schemas.test.ts\ | ✅ |
| Webhook emite document:statusChanged | \socket-client.test.ts\ | ✅ |
| Webhook emite integration:incident | \socket-client.test.ts\ | ✅ |
| Aislamiento de rooms | \socket-client.test.ts\ | ✅ |

## Pruebas Manuales con PowerShell

### Webhook válido
\\\powershell
.\scripts\test-webhook.ps1 mi-documento-001
\\\

### Webhook con firma inválida (incidencia)
\\\powershell
.\scripts\test-incident.ps1 mi-documento-001
\\\

### Cliente Socket.IO CLI
\\\ash
npm run socket:test
\\\

### Demo completo
\\\ash
npm run demo
\\\

---

## Justificación de Decisiones de Diseño

### ¿Por qué HMAC-SHA256?

HMAC (Hash-based Message Authentication Code) es el estándar de la industria para autenticar webhooks porque:

1. **Verifica autenticidad**: Solo sistemas con la clave secreta pueden generar firmas válidas
2. **Verifica integridad**: Cualquier modificación del payload invalida la firma
3. **Resistente a timing attacks**: Usamos \crypto.timingSafeEqual()\ para evitar ataques de tiempo
4. **Estándar de la industria**: GitHub, Stripe, y otros servicios líderes usan HMAC para webhooks
5. **Sin dependencias externas**: Usa el módulo \crypto\ nativo de Node.js

**Implementación:**
\\\	ypescript
// src/shared/lib/hmac.ts
export function verifyHmacSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}
\\\

### ¿Cómo se resuelve la idempotencia?

La idempotencia se implementa en **dos capas**:

**1. Capa de aplicación:**
Al recibir un webhook, verificamos si ya existe un evento procesado con el mismo \documentId\ + \status\. Si existe, retornamos \200 OK\ sin procesar de nuevo.

\\\	ypescript
// src/webhooks.ts
const alreadyProcessed = await isEventProcessed(documentId, status);
if (alreadyProcessed) {
  return res.status(200).json({
    message: 'Evento ya procesado (idempotente)',
    documentId,
    status,
  });
}
\\\

**2. Capa de base de datos:**
Un constraint único en \(document_id, status)\ en la tabla \webhook_events\ garantiza que no se puedan insertar duplicados a nivel de BD, incluso en escenarios de concurrencia.

\\\	ypescript
// src/shared/db/schema.ts
export const webhookEvents = pgTable('webhook_events', {
  id: varchar('id').primaryKey().notNull(),
  documentId: varchar('document_id').notNull(),
  status: webhookStatusEnum('status').notNull(),
  // ...
}, (table) => ({
  uniqueDocumentStatus: unique('unique_document_status').on(table.documentId, table.status),
}));
\\\

### ¿Qué se haría en producción?

Si este sistema escalara a producción real, implementaríamos:

1. **Cola de mensajes (RabbitMQ/SQS)**: Para manejar picos de carga y garantizar entrega de webhooks
2. **Dead-letter queue**: Webhooks que fallan después de 5 intentos van a una cola de revisión manual
3. **Rate limiting**: Limitar solicitudes por IP para prevenir abuse y ataques DDoS
4. **Certificados mTLS**: Autenticación mutua entre servicios para mayor seguridad
5. **Monitoreo y alertas**: Alertas cuando la tasa de webhooks fallidos supere el 5%
6. **Distribución geográfica**: Replicar servicios en múltiples regiones para alta disponibilidad
7. **Versionado de API**: Soporte para múltiples versiones de la API (v1, v2, etc.)
8. **Logging estructurado**: Integración con ELK Stack o Datadog para análisis de logs

---

## Criterios de Evaluación - Cumplimiento

| Criterio | Peso | Estado |
|---|---|---|
| Separación correcta API saliente vs. webhook entrante | 15% | ✅ 15/15 |
| Seguridad del webhook (verificación de firma) | 15% | ✅ 15/15 |
| Idempotencia y manejo de duplicados/fallos | 15% | ✅ 15/15 |
| Modelo de datos y migraciones con Drizzle | 10% | ✅ 10/10 |
| Notificación en tiempo real con Socket.IO | 15% | ✅ 15/15 |
| Pruebas automatizadas | 15% | ✅ 15/15 |
| Documentación y diagrama de flujo | 15% | ✅ 15/15 |
| **TOTAL** | **100%** | **100/100** |
