import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import express from 'express';
import http from 'http';
import { db, documents, webhookEvents, incidents } from '../src/shared/db';
import sistemaARoutes from '../src/sistema-a/routes/create';
import sistemaAReconcileRoutes from '../src/sistema-a/routes/reconcile';
import sistemaASimulateRoutes from '../src/sistema-a/routes/simulate';
import webhookRoutes from '../src/webhooks';
import { initializeSocketIO } from '../src/shared/lib/socket';

describe('Socket.IO - Notificación en tiempo real', () => {
  let socket: Socket;
  let httpServer: any;
  const TEST_DOCUMENT_ID = 'test-socket-doc-' + Date.now();
  const receivedEvents: Array<{ type: string; data: any }> = [];
  const TEST_PORT = 3099;

  let app: any;

  beforeAll(async () => {
    // Limpiar base de datos
    await db.delete(webhookEvents);
    await db.delete(incidents);
    await db.delete(documents);

    // Crear una instancia de Express independiente para los tests
    app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Montar rutas
    app.use('/documents', sistemaARoutes);
    app.use('/documents', sistemaAReconcileRoutes);
    app.use('/documents', sistemaASimulateRoutes);
    app.use('/webhooks', webhookRoutes);

    // Crear servidor HTTP + Socket.IO
    httpServer = http.createServer(app);
    initializeSocketIO(httpServer);

    // Iniciar servidor en puerto de test
    await new Promise<void>((resolve) => {
      httpServer.listen(TEST_PORT, () => resolve());
    });

    // Pequeña pausa para asegurar que Socket.IO esté listo
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Crear cliente Socket.IO
    socket = io(`http://localhost:${TEST_PORT}`, {
      transports: ['websocket', 'polling'],
      reconnection: false,
      timeout: 5000,
    });

    // Configurar listeners ANTES de la suscripción
    socket.on('document:statusChanged', (data: any) => {
      receivedEvents.push({ type: 'document:statusChanged', data });
    });

    socket.on('integration:incident', (data: any) => {
      receivedEvents.push({ type: 'integration:incident', data });
    });

    // Esperar conexión Y suscripción completa
    await new Promise<void>((resolve) => {
      socket.on('connect', () => {
        socket.emit('subscribe:document', TEST_DOCUMENT_ID);
        socket.emit('subscribe:admins');
        setTimeout(resolve, 500);
      });
    });
  });

  afterAll(() => {
    socket.disconnect();
    if (httpServer) {
      httpServer.close();
    }
  });

  it('debe recibir evento document:statusChanged al procesar webhook approved', async () => {
    // 1. Crear documento
    const createResponse = await request(app)
      .post('/documents')
      .send({
        documentId: TEST_DOCUMENT_ID,
        thirdPartyEmail: 'socket-test@example.com',
        fileUrl: 'https://example.com/socket-test.pdf',
        callbackUrl: `http://localhost:${TEST_PORT}/webhooks/absign`,
      });

    expect(createResponse.status).toBe(201);

    // 2. Enviar webhook manualmente
    const webhookPayload = {
      documentId: TEST_DOCUMENT_ID,
      status: 'approved',
      reason: 'Aprobado vía webhook de prueba',
      timestamp: new Date().toISOString(),
    };

    // Generar firma HMAC ordenada
    const crypto = await import('crypto');
    const sortedPayload = Object.keys(webhookPayload).sort().reduce((obj: any, key: string) => {
      obj[key] = webhookPayload[key];
      return obj;
    }, {});
    const signature = crypto.default
      .createHmac('sha256', process.env.HMAC_SECRET || 'dev-secret')
      .update(JSON.stringify(sortedPayload))
      .digest('hex');

    const webhookResponse = await request(app)
      .post('/webhooks/absign')
      .set('X-Signature', signature)
      .send({
        ...webhookPayload,
        signature,
      });

    expect(webhookResponse.status).toBe(200);

    // 3. Esperar a que el evento llegue al cliente
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 4. Verificar evento recibido
    const statusEvent = receivedEvents.find((e) => e.type === 'document:statusChanged');
    expect(statusEvent).toBeDefined();
    expect(statusEvent!.data).toMatchObject({
      documentId: TEST_DOCUMENT_ID,
      status: 'approved',
      reason: 'Aprobado vía webhook de prueba',
    });
  });

  it('debe recibir evento integration:incident al enviar firma inválida', async () => {
    // Limpiar eventos previos
    receivedEvents.length = 0;

    const webhookPayload = {
      documentId: 'fake-doc',
      status: 'approved',
      timestamp: new Date().toISOString(),
    };

    await request(app)
      .post('/webhooks/absign')
      .set('X-Signature', '0'.repeat(64))
      .send({
        ...webhookPayload,
        signature: '0'.repeat(64),
      });

    // Esperar evento Socket.IO
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verificar incidente recibido
    const incidentEvent = receivedEvents.find((e) => e.type === 'integration:incident');
    expect(incidentEvent).toBeDefined();
    expect(incidentEvent!.data.type).toBe('invalid_signature');
  });

  it('debe usar rooms para dirigir eventos al documento correcto', async () => {
    const OTHER_DOCUMENT_ID = 'other-doc-' + Date.now();
    const otherEvents: any[] = [];

    // Crear socket temporal para otro documento
    const otherSocket = io(`http://localhost:${TEST_PORT}`, {
      transports: ['websocket', 'polling'],
      reconnection: false,
      timeout: 5000,
    });

    await new Promise<void>((resolve) => {
      otherSocket.on('connect', () => {
        otherSocket.emit('subscribe:document', OTHER_DOCUMENT_ID);
        otherSocket.on('document:statusChanged', (data: any) => {
          otherEvents.push(data);
        });
        setTimeout(resolve, 500);
      });
    });

    // Crear documento y enviar webhook para OTRO documento
    await request(app)
      .post('/documents')
      .send({
        documentId: OTHER_DOCUMENT_ID,
        thirdPartyEmail: 'other@example.com',
        fileUrl: 'https://example.com/other.pdf',
        callbackUrl: `http://localhost:${TEST_PORT}/webhooks/absign`,
      });

    const webhookPayload = {
      documentId: OTHER_DOCUMENT_ID,
      status: 'rejected',
      reason: 'Rechazado para prueba de rooms',
      timestamp: new Date().toISOString(),
    };

    const crypto = await import('crypto');
    const sortedPayload = Object.keys(webhookPayload).sort().reduce((obj: any, key: string) => {
      obj[key] = webhookPayload[key];
      return obj;
    }, {});
    const signature = crypto.default
      .createHmac('sha256', process.env.HMAC_SECRET || 'dev-secret')
      .update(JSON.stringify(sortedPayload))
      .digest('hex');

    await request(app)
      .post('/webhooks/absign')
      .set('X-Signature', signature)
      .send({
        ...webhookPayload,
        signature,
      });

    // Esperar a que el evento llegue al socket correcto
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verificar que el socket de OTRO documento recibió el evento
    expect(otherEvents.length).toBeGreaterThan(0);
    expect(otherEvents[0].status).toBe('rejected');

    // Verificar que el socket principal NO recibió este evento
    const wrongEvent = receivedEvents.find(
      (e) => e.data.documentId === OTHER_DOCUMENT_ID
    );
    expect(wrongEvent).toBeUndefined();

    otherSocket.disconnect();
  });
});