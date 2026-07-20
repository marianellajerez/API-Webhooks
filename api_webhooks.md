# Integración entre sistemas vía API y Webhooks

## Stack requerido

- **Runtime/Lenguaje**: Node.js + TypeScript
- **Framework HTTP**: Express (v4 o v5)
- **ORM / DB**: Drizzle ORM + PostgreSQL
- **Validación**: Zod
- **Testing**: Vitest (+ supertest para pruebas de endpoints)
- **Tiempo real**: Socket.IO
- **Autenticación de webhook**: HMAC-SHA256 (con `crypto` nativo o `crypto-js`)
- **Gestor de paquetes**: npm

## Contexto

Existen dos sistemas independientes:

- **Sistema A (Gestor de Documentos)**: aquí se crean y suben documentos que deben enviarse a un tercero para revisión.
- **Sistema B (Plataforma de Firma)**: aquí se gestiona el envío al tercero, el seguimiento y la decisión final (aprobado/rechazado).

No se dará acceso al código ni a la API real de ningún sistema interno. El candidato debe construir **ambos lados simulados** (Sistema A y un mock de Sistema B) dentro de un único repo Node/TS, demostrando el patrón API + Webhook entre servicios desacoplados.

## Requisitos técnicos a evaluar

### 1. API saliente (Sistema A → Sistema B)

- `POST /documents` en Sistema B (mock) que reciba `{ documentId, thirdPartyEmail, fileUrl, callbackUrl }`.
- Cliente HTTP en Sistema A con manejo de timeout/errores/reintentos (`fetch`/`axios` con backoff).

### 2. Webhook entrante (Sistema B → Sistema A)

- Endpoint en Sistema A: `POST /webhooks/absign`.
- Payload: `{ documentId, status: "approved"|"rejected", reason?, timestamp, signature }`.
- **Verificación HMAC** del header `X-Signature` contra un secreto compartido (`HMAC_SECRET` en `.env`), rechazando payloads no válidos con 401.
- **Idempotencia**: si llega el mismo `documentId` + `status` dos veces, no debe duplicar efectos (usar tabla de eventos procesados o `unique constraint`).

### 3. Modelo de datos (Drizzle + PostgreSQL)

- Tabla `documents`: `id, status (enum: pending|sent|approved|rejected), thirdPartyEmail, sentAt, resolvedAt`.
- Tabla `webhook_events`: `id, documentId, payload (jsonb), receivedAt, processed` — para auditoría e idempotencia.
- Validación de entrada con Zod en ambos endpoints.

### 4. Resiliencia

- Si Sistema A está caído cuando llega el webhook, Sistema B (mock) debe reintentar con backoff (mínimo 3 intentos).
- Endpoint de reconciliación opcional: `GET /documents/:id/status` que Sistema A pueda consultar como respaldo si nunca llegó el webhook (patrón polling de reserva).

### 5. Pruebas (Vitest + Supertest)

- Test del flujo feliz: enviar documento → simular webhook aprobado → verificar estado en DB.
- Test de rechazo de webhook con firma inválida.
- Test de idempotencia (mismo evento dos veces).

### 6. (Bonus) Notificación en tiempo real con Socket.IO

Además de persistir el estado en la base de datos, Sistema A debe **emitir un evento en tiempo real** al frontend cuando reciba y procese el webhook, para que la UI se actualice sin necesidad de refrescar o hacer polling.

- Al recibir un webhook válido en `POST /webhooks/absign`, tras persistir el cambio de estado, emitir por Socket.IO un evento (ej. `document:statusChanged`) con `{ documentId, status, reason? }`.
- El evento debe dirigirse solo a los clientes interesados en ese documento (usar **rooms** de Socket.IO, ej. `room = document:${documentId}` o `room = user:${ownerId}`), no un broadcast global.
- En el cliente (puede ser un script simple de prueba o un mini frontend), suscribirse al room correspondiente y loguear/mostrar el cambio de estado en vivo.
- El sistema también debe **reportar incidencias e interrupciones de conexión** (timeouts, caídas, webhooks no entregados, firmas inválidas repetidas) en lugar de fallar silenciosamente: registrar cada una (tipo, documento asociado, detalle, fecha) y emitir en tiempo real un evento (ej. integration:incident) a un room de administradores cuando ocurra una incidencia crítica.

## Entregables

- Repo con estructura clara (`server/`, `routes/`, `db/schema.ts`, `tests/`).
- Script o comando (`npm run demo`) que dispare el flujo completo sin intervención manual.
- README con diagrama de secuencia (ASCII o Mermaid) del flujo API + Webhook.
- Justificación breve (media página) de: por qué HMAC, cómo se resuelve idempotencia, qué se haría si esto escalara a producción real (colas, retries, dead-letter).

## Criterios de evaluación

| Criterio | Peso |
|---|---|
| Separación correcta API saliente vs. webhook entrante | 15% |
| Seguridad del webhook (verificación de firma) | 15% |
| Idempotencia y manejo de duplicados/fallos | 15% |
| Modelo de datos y migraciones con Drizzle | 10% |
| Notificación en tiempo real con Socket.IO (rooms, desacoplamiento) | 15% |
| Pruebas automatizadas | 15% |
| Documentación y diagrama de flujo | 15% |
