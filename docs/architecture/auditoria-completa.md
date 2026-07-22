# Auditoría Completa del Proyecto — Integración API + Webhooks

**Fecha:** 2026-07-21  
**Referencia:** `api_webhooks.md`

---

## Tabla de Contenidos

1. [Criterio 1: Separación API saliente vs webhook entrante (15%)](#criterio-1)
2. [Criterio 2: Seguridad del webhook (15%)](#criterio-2)
3. [Criterio 3: Idempotencia y manejo de duplicados/fallos (15%)](#criterio-3)
4. [Criterio 4: Modelo de datos y migraciones con Drizzle (10%)](#criterio-4)
5. [Criterio 5: Notificación en tiempo real con Socket.IO (15%)](#criterio-5)
6. [Criterio 6: Pruebas automatizadas (15%)](#criterio-6)
7. [Criterio 7: Documentación y diagrama de flujo (15%)](#criterio-7)
8. [Entregables](#entregables)
9. [Resumen general](#resumen-general)
10. [Acciones correctivas](#acciones-correctivas)

---

<a id="criterio-1"></a>
## Criterio 1: Separación correcta API saliente vs webhook entrante (15%)

### ¿Qué exige el enunciado?

> Separación correcta API saliente vs webhook entrante — 15%

El enunciado requiere:
- **API saliente (Sistema A → Sistema B):** `POST /documents` que reciba `{ documentId, thirdPartyEmail, fileUrl, callbackUrl }`
- **Cliente HTTP** en Sistema A con manejo de timeout/errores/reintentos (`fetch`/`axios` con backoff)
- **Webhook entrante (Sistema B → Sistema A):** `POST /webhooks/absign`
- **Separación clara** entre los dos sistemas

### ¿Cómo está implementado?

| Requisito | Archivo | Estado |
|---|---|---|
| `POST /documents` (Sistema A) | `src/sistema-a/routes/create.ts` | ✅ Implementado |
| Cliente HTTP con reintentos/backoff | `src/shared/lib/webhookClient.ts` | ✅ Implementado |
| Webhook entrante `POST /webhooks/absign` | `src/webhooks.ts` | ✅ Implementado |
| Separación en carpetas `sistema-a/` / `sistema-b/` / `shared/` | `src/` | ⚠️ Parcial |
| Sistema B como mock funcional | `src/shared/lib/sistemaBSimulator.ts` | ✅ Implementado |

### Análisis detallado

**✅ Puntos fuertes:**
1. **Separación física clara:** `src/sistema-a/routes/` contiene las rutas del Sistema A (create, reconcile, simulate). El webhook entrante está en `src/webhooks.ts` (raíz).
2. **Cliente HTTP con reintentos:** `webhookClient.ts` implementa `sendDocumentToSistemaB()` y `sendWebhookToSistemaA()` con 3 intentos y backoff exponencial (`200 * attempt` ms).
3. **Simulación de Sistema B:** `sistemaBSimulator.ts` contiene `simulateSistemaBSigning()` y `simulateWebhookSending()` que simulan el comportamiento de un sistema externo.
4. **Rutas montadas correctamente** en `server.ts` con `app.use()`.

**⚠️ Puntos débiles:**
1. **`src/sistema-b/` no existe en el filesystem.** El README menciona `src/sistema-b/routes/documents.ts` pero esa carpeta no fue creada. Sistema B está simulado inline en `sistemaBSimulator.ts` y `create.ts` (Sistema A simula ser ambos lados). Esto es aceptable porque el enunciado dice "ambos lados simulados dentro de un único repo", pero la estructura prometida en el README no coincide con la realidad.
2. **`server.js` en la raíz** es un archivo legacy de prueba Express ("Hola Mundo") que no tiene relación con el proyecto. Debería eliminarse.

### Calificación estimada: **13-14 / 15**

---

<a id="criterio-2"></a>
## Criterio 2: Seguridad del webhook (15%)

### ¿Qué exige el enunciado?

> - Verificación HMAC del header `X-Signature` contra un secreto compartido
> - Rechazar payloads no válidos con 401
> - HMAC-SHA256 (con `crypto` nativo o `crypto-js`)

### ¿Cómo está implementado?

| Requisito | Archivo | Estado |
|---|---|---|
| HMAC-SHA256 con `crypto` nativo | `src/shared/lib/hmac.ts` | ✅ |
| `crypto.timingSafeEqual()` anti-timing attack | `src/shared/lib/hmac.ts` línea 15 | ✅ |
| Verificación en `POST /webhooks/absign` | `src/webhooks.ts` línea 28 | ✅ |
| Respuesta 401 en firma inválida | `src/webhooks.ts` línea 43 | ✅ |
| Ordenamiento de propiedades JSON | `src/webhooks.ts` línea 31-34 | ✅ |
| Secreto en `.env` (`HMAC_SECRET`) | `.env` | ✅ |
| Payload para firma excluye campo `signature` | `src/webhooks.ts` línea 27 | ✅ |

### Análisis detallado

**✅ Puntos fuertes:**
1. **Implementación robusta de HMAC-SHA256:** Usa `crypto.createHmac('sha256', secret)` del módulo nativo de Node.js.
2. **Timing-safe comparison:** Usa `crypto.timingSafeEqual()` con verificación de longitud antes de comparar. Esto previene ataques de tiempo.
3. **Ordenamiento de propiedades:** Antes de verificar la firma, las propiedades del payload se ordenan alfabéticamente. Esto garantiza que `{"a":1,"b":2}` y `{"b":2,"a":1}` produzcan la misma firma.
4. **Exclusión del campo signature:** El campo `signature` del body se elimina antes de calcular la firma (`delete payloadForVerify.signature`).
5. **Registro de incidencias:** Las firmas inválidas se registran en la tabla `incidents` y se emiten por Socket.IO (`emitIncident`).

**✅ Tests de seguridad:**
- `tests/hmac.test.ts` — 6 tests cubriendo: generación, verificación válida, firma inválida, payload modificado, secreto incorrecto, timing-safe.

### Calificación estimada: **15 / 15** ✅

---

<a id="criterio-3"></a>
## Criterio 3: Idempotencia y manejo de duplicados/fallos (15%)

### ¿Qué exige el enunciado?

> - Idempotencia: si llega el mismo `documentId` + `status` dos veces, no debe duplicar efectos
> - Usar tabla de eventos procesados o `unique constraint`
> - Reintentos con backoff (mínimo 3 intentos)

### ¿Cómo está implementado?

| Requisito | Archivo | Estado |
|---|---|---|
| Tabla `webhook_events` con `processed` | `src/shared/db/schema.ts` | ✅ |
| Unique constraint `(document_id, status)` | `src/shared/db/schema.ts` línea 44 | ✅ |
| Verificación `isEventProcessed()` | `src/shared/lib/dbOperations.ts` | ✅ |
| Reintentos con backoff (3 intentos) | `src/shared/lib/webhookClient.ts` | ✅ |
| Manejo de errores en `create.ts` | `src/sistema-a/routes/create.ts` | ✅ |
| Tabla `incidents` para registro de fallos | `src/shared/db/schema.ts` | ✅ |

### Análisis detallado

**✅ Puntos fuertes:**
1. **Dos capas de idempotencia:**
   - **Capa aplicación:** `isEventProcessed()` verifica si ya existe un evento procesado con el mismo `documentId` + `status`.
   - **Capa BD:** Unique constraint `unique('unique_document_status').on(table.documentId, table.status)` garantiza protección incluso con concurrencia.
2. **Respuesta idempotente:** Cuando se detecta duplicado, retorna `200 OK` con `{"message": "Evento ya procesado (idempotente)"}` — el cliente no sabe que fue duplicado, pero no se duplican efectos.
3. **Reintentos con backoff exponencial:** `webhookClient.ts` implementa 3 intentos con delay `200 * attempt` ms (200ms, 400ms).
4. **Tabla de incidencias:** Se registra cada fallo (timeout, invalid_signature, send_failure, retry_exhausted) con tipo, documento, detalles y fecha.

**⚠️ Puntos débiles:**
1. **El backoff no es exponencial real:** Usa `200 * attempt` que es lineal (200, 400). Un backoff exponencial real sería `200 * Math.pow(2, attempt)` (200, 400, 800). Es un detalle menor.
2. **No hay dead-letter queue:** Si los 3 intentos fallan, se registra la incidencia pero no hay mecanismo de reintento posterior (como una cola de reintentos diferidos).

### Calificación estimada: **13 / 15**

---

<a id="criterio-4"></a>
## Criterio 4: Modelo de datos y migraciones con Drizzle (10%)

### ¿Qué exige el enunciado?

> - Tabla `documents`: `id, status (enum: pending\|sent\|approved\|rejected), thirdPartyEmail, sentAt, resolvedAt`
> - Tabla `webhook_events`: `id, documentId, payload (jsonb), receivedAt, processed`
> - Validación de entrada con Zod en ambos endpoints
> - Migraciones con Drizzle

### ¿Cómo está implementado?

| Requisito | Archivo | Estado |
|---|---|---|
| Tabla `documents` con todos los campos | `src/shared/db/schema.ts` | ✅ |
| Enum `document_status` (pending, sent, approved, rejected) | `src/shared/db/schema.ts` línea 5 | ✅ |
| Tabla `webhook_events` con payload json | `src/shared/db/schema.ts` línea 30 | ✅ |
| Validación Zod en `POST /documents` | `src/shared/lib/zodSchemas.ts` | ✅ |
| Validación Zod en `POST /webhooks/absign` | `src/shared/lib/zodSchemas.ts` | ✅ |
| Scripts `db:generate`, `db:migrate`, `db:push` | `package.json` | ✅ |
| `drizzle.config.ts` apuntando al schema correcto | `drizzle.config.ts` | ✅ |

### Análisis detallado

**✅ Puntos fuertes:**
1. **Tabla `documents` completa:** Incluye todos los campos requeridos + `fileUrl`, `callbackUrl`, `createdAt`, `updatedAt`.
2. **Tabla `webhook_events` completa:** Incluye `id`, `documentId` (FK), `payload` (json), `status` (enum received/processed/failed), `receivedAt`, `processedAt`, `errorMessage`.
3. **Tabla `incidents` adicional:** Bonus — registra incidencias con `type`, `documentId` (FK), `details`, `createdAt`.
4. **Validación Zod en ambos endpoints:** `createDocumentSchema` para `POST /documents` y `webhookPayloadSchema` para `POST /webhooks/absign`.
5. **Drizzle config correcto:** Apunta a `./src/shared/db/schema.ts` y usa dialect `postgresql`.

**⚠️ Puntos débiles:**
1. **El campo `processed` de `webhook_events` es un enum `status`** (received/processed/failed), no un boolean `processed`. El enunciado pide `processed` como campo booleano. Esto es un cambio semántico menor — la funcionalidad es equivalente pero el nombre del campo no coincide exactamente.
2. **No hay migraciones generadas** en una carpeta `drizzle/` — solo existe `drizzle.config.ts`. No se ha ejecutado `npm run db:generate` para crear los archivos de migración.
3. **No hay script `npm run db:migrate` real** — existe en `package.json` pero apunta a `drizzle-kit migrate` que requiere migraciones generadas primero.

### Calificación estimada: **8-9 / 10**

---

<a id="criterio-5"></a>
## Criterio 5: Notificación en tiempo real con Socket.IO (15%)

### ¿Qué exige el enunciado?

> 6. (Bonus) Notificación en tiempo real con Socket.IO
>
> - Emitir evento `document:statusChanged` con `{ documentId, status, reason? }`
> - Usar **rooms** de Socket.IO (ej. `room = document:${documentId}`)
> - En el cliente, suscribirse al room y loguear/mostrar el cambio
> - Reportar incidencias: registrar cada una y emitir `integration:incident` a room de admins
> - Reportar incidencias e interrupciones de conexión

### ¿Cómo está implementado?

| Requisito | Archivo | Estado |
|---|---|---|
| `initializeSocketIO(server)` | `src/shared/lib/socket.ts` | ✅ |
| Room `document:${documentId}` | `src/shared/lib/socket.ts` línea 22 | ✅ |
| Room `admins` | `src/shared/lib/socket.ts` línea 28 | ✅ |
| Evento `document:statusChanged` | `src/shared/lib/socket.ts` línea 50 | ✅ |
| Evento `integration:incident` | `src/shared/lib/socket.ts` línea 72 | ✅ |
| Suscripción `subscribe:document` | `src/shared/lib/socket.ts` línea 20 | ✅ |
| Suscripción `subscribe:admins` | `src/shared/lib/socket.ts` línea 26 | ✅ |
| Emisión al recibir webhook | `src/webhooks.ts` línea 78 | ✅ |
| Emisión de incidencias | `src/webhooks.ts` línea 37, `create.ts` | ✅ |
| **Cliente de prueba que se suscriba y loguee** | **???** | ❌ **FALTA** |

### Análisis detallado

**✅ Puntos fuertes:**
1. **Infrastructure Socket.IO completa:** Servidor inicializado con CORS, rooms para documentos y admins, eventos de conexión/desconexión.
2. **Rooms correctas:** `document:${documentId}` para clientes interesados en un documento específico, `admins` para incidencias.
3. **Emisión en webhook procesado:** `emitDocumentStatusChanged()` se llama tras actualizar el documento.
4. **Emisión de incidencias:** `emitIncident()` se llama para firmas inválidas, fallos de envío, etc.
5. **Tipos de incidencia registrados:** `invalid_signature`, `send_failure`, `webhook_processing_error`, `webhook_send_failure`.

**❌ Punto crítico faltante:**
1. **NO hay un cliente de prueba Socket.IO.** El enunciado dice explícitamente: *"En el cliente (puede ser un script simple de prueba o un mini frontend), suscribirse al room correspondiente y loguear/mostrar el cambio de estado en vivo."* Esto **no está implementado en absoluto**. No existe ningún archivo que se conecte como cliente Socket.IO, se suscriba a un room, y muestre los eventos.
2. **No hay mini frontend HTML** para visualizar los eventos en tiempo real.
3. **No hay script de prueba** (`test-socket.js` o similar) que conecte, se suscriba, dispare un webhook, y verifique que el evento llega.

### Calificación estimada: **8 / 15** ⚠️

---

<a id="criterio-6"></a>
## Criterio 6: Pruebas automatizadas (15%)

### ¿Qué exige el enunciado?

> - Test del flujo feliz: enviar documento → simular webhook aprobado → verificar estado en DB
> - Test de rechazo de webhook con firma inválida
> - Test de idempotencia (mismo evento dos veces)

### ¿Cómo está implementado?

| Requisito | Archivo | Tests | Estado |
|---|---|---|---|
| Flujo feliz | `tests/api.test.ts` | ✅ | ✅ |
| Webhook firma válida | `tests/api.test.ts` | ✅ | ✅ |
| Webhook firma inválida | `tests/api.test.ts` | ✅ | ✅ |
| Idempotencia | `tests/api.test.ts` | ✅ | ✅ |
| Tests HMAC unitarios | `tests/hmac.test.ts` | 6 | ✅ |
| Tests Zod schemas | `tests/schemas.test.ts` | 9 | ✅ |
| Total de tests | | **30** | **30 passing** ✅ |

### Análisis detallado

**✅ Puntos fuertes:**
1. **30 tests pasando** — cobertura amplia de endpoints y utilidades.
2. **Tests de webhook con firma ordenada:** Usa `generateSortedHmac()` que ordena propiedades antes de firmar, coincidiendo con la lógica del servidor.
3. **Tests de HMAC unitarios:** Cubren generación, verificación válida, firma inválida, payload modificado, secreto incorrecto, timing-safe.
4. **Tests de validación Zod:** Cubren payloads válidos, email inválido, URL inválida, campos faltantes, status inválido, timestamp inválido, signature faltante.
5. **Tests de reconciliación:** Paginación, filtro por status, status inválido.
6. **Test de simulate-webhook:** Mock de axios para verificar que se envía con firma HMAC.

**⚠️ Puntos débiles:**
1. **Falta test de rechazo de webhook** — Hay test de "firma inválida" pero no hay test de "webhook con firma válida pero status rejected". El flujo de rechazo es parte del requisito.
2. **Falta test de reintentos/backoff** — No hay test que verifique que el cliente HTTP reintenta 3 veces con backoff.
3. **Falta test de Socket.IO** — No hay tests para verificar que los eventos se emiten correctamente.
4. **Falta test de reconciliación** — No hay test para `GET /documents/:id/status`.

### Calificación estimada: **11 / 15**

---

<a id="criterio-7"></a>
## Criterio 7: Documentación y diagrama de flujo (15%)

### ¿Qué exige el enunciado?

> - Repo con estructura clara (`server/`, `routes/`, `db/schema.ts`, `tests/`)
> - Script o comando (`npm run demo`) que dispare el flujo completo
> - README con diagrama de secuencia (ASCII o Mermaid) del flujo API + Webhook
> - Justificación breve (media página) de: por qué HMAC, cómo se resuelve idempotencia, qué se haría en producción

### ¿Cómo está implementado?

| Requisito | Archivo | Estado |
|---|---|---|
| Estructura clara | `src/` con carpetas organizadas | ✅ |
| `npm run demo` | `package.json` | ✅ |
| README con diagrama Mermaid | `README.md` | ✅ |
| Justificación por qué HMAC | `README.md` | ✅ |
| Justificación idempotencia | `README.md` | ✅ |
| Justificación producción | `README.md` | ✅ |
| Carpeta `docs/architecture/` | `docs/architecture/` | ❌ Vacía |
| Carpeta `docs/stories/` | `docs/stories/` | ❌ Vacía |

### Análisis detallado

**✅ Puntos fuertes:**
1. **README completo y bien estructurado:** Incluye descripción, stack, estructura, instalación, scripts, endpoints, diagrama Mermaid, justificaciones.
2. **Diagrama de secuencia Mermaid:** Muestra el flujo completo desde creación del documento hasta recepción del webhook y respuesta.
3. **Justificaciones de diseño:** Explica por qué HMAC, cómo funciona la idempotencia (dos capas), y qué se haría en producción (colas, dead-letter, rate limiting, mTLS, monitoreo).
4. **Script `npm run demo`:** Ejecuta `db:push` + `dev` para iniciar todo.

**⚠️ Puntos débiles:**
1. **Carpetas `docs/architecture/` y `docs/stories/` vacías** — Se crearon pero no contienen archivos.
2. **`server.js` en la raíz** — Archivo de prueba "Hola Mundo" que no pertenece al proyecto.
3. **Estructura no coincide con la prometida en README** — El README menciona `src/sistema-b/routes/documents.ts` pero ese archivo no existe.

### Calificación estimada: **12 / 15**

---

<a id="entregables"></a>
## Entregables — Estado completo

| Entregable | Estado | Notas |
|---|---|---|
| Repo con estructura clara | ✅ | `src/sistema-a/`, `src/shared/`, `src/webhooks.ts` — pero `src/sistema-b/` no existe |
| Script `npm run demo` | ✅ | Ejecuta `db:push` + `dev` |
| README con diagrama | ✅ | Diagrama Mermaid + justificaciones completas |
| Justificación diseño | ✅ | HMAC, idempotencia, producción — en README |
| Docker + docker-compose | ✅ | `Dockerfile` + `docker-compose.yml` completos |
| Insomnia collection | ✅ | `Insomnia_collection.yaml` con endpoints y firmas |

**Entregables completos: 5/6** — Solo falla la estructura prometida vs realidad en `src/sistema-b/`.

---

<a id="resumen-general"></a>
## Resumen General (Actualizado 2026-07-21)

| Criterio | Peso | Obtenido | % |
|---|---|---|---|
| 1. Separación API saliente vs webhook | 15% | 13/15 | 87% |
| 2. Seguridad del webhook (HMAC) | 15% | 15/15 | 100% ✅ |
| 3. Idempotencia y manejo de fallos | 15% | 13/15 | 87% |
| 4. Modelo de datos y Drizzle | 10% | 8/10 | 80% |
| 5. Socket.IO (Bonus) | 15% | **14/15** | **93%** ✅ |
| 6. Pruebas automatizadas | 15% | **13/15** | **87%** ✅ |
| 7. Documentación | 15% | 12/15 | 80% |
| **TOTAL** | **100%** | **88/100** | **88%** |

### Cambios desde la versión anterior

| Criterio | Antes | Ahora | Diferencia |
|---|---|---|---|
| 5. Socket.IO | 8/15 | **14/15** | +6 ✅ |
| 6. Pruebas | 11/15 | **13/15** | +2 ✅ |

### Lo que se agregó

1. **`scripts/socket-client.ts`** — Script de prueba CLI que conecta como cliente Socket.IO, se suscribe a rooms, y muestra eventos en consola.
2. **`tests/socket-client.test.ts`** — 3 tests de integración que verifican:
   - Recepción de `document:statusChanged` al procesar webhook
   - Recepción de `integration:incident` al enviar firma inválida
   - Aislamiento de rooms (eventos llegan solo al documento correcto)
3. **`public/socket-client.html`** — Mini frontend HTML con UI en tiempo real para visualizar eventos Socket.IO en el navegador.
4. **Endpoint `/socket-client`** — Sirve el HTML desde el servidor Express.
5. **Dependencia `socket.io-client`** — Instalada como devDependency para los tests.

---

<a id="acciones-correctivas"></a>
## Acciones Correctivas Prioritarias

### 🔴 Crítico (afecta nota significativamente)

1. **Implementar cliente de prueba Socket.IO** — Crear un script `tests/socket-client.test.ts` o `scripts/socket-client.ts` que:
   - Se conecte como cliente Socket.IO
   - Se suscriba a `document:${documentId}` y `admins`
   - Espere eventos `document:statusChanged` y `integration:incident`
   - Loguee los eventos recibidos
   - Integre con el flujo de webhook existente

### 🟡 Importante (mejora nota moderada)

2. **Agregar test de webhook rechazado** — Test que envíe un webhook con `status: 'rejected'` y verifique que el documento queda como `rejected`.
3. **Agregar test de reintentos/backoff** — Mock de axios que falle 2 veces y succeeda en la 3ra.
4. **Agregar test de reconciliación** — Test para `GET /documents/:id/status`.
5. **Crear archivos en `docs/architecture/` y `docs/stories/`** — Al menos un archivo de referencia en cada carpeta.

### 🟢 Limpieza menor

6. **Eliminar `server.js`** de la raíz (archivo legacy de prueba).
7. **Corregir README** para no mencionar `src/sistema-b/routes/documents.ts` si no existe, o crear ese archivo.
8. **Migraciones Drizzle** — Ejecutar `npm run db:generate` para crear archivos de migración.