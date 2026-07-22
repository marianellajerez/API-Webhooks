import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import axios from 'axios';
import { app } from '../src/server';
import { db, documents, webhookEvents, incidents } from '../src/shared/db';
import { generateHmacSignature } from '../src/shared/lib/hmac';
import crypto from 'crypto';

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Genera firma HMAC con propiedades ordenadas (para coincidir con el código del webhook)
 */
function generateSortedHmac(payload: any, secret: string): string {
  const sortedPayload = Object.keys(payload).sort().reduce((obj: any, key: string) => {
    obj[key] = payload[key];
    return obj;
  }, {});
  return generateHmacSignature(JSON.stringify(sortedPayload), secret);
}

describe('Fase 1 - API Endpoints', () => {
  beforeAll(async () => {
    // Limpiar base de datos antes de cada test suite
    await db.delete(webhookEvents);
    await db.delete(incidents);
    await db.delete(documents);
  });

  describe('POST /documents', () => {
    it('debe crear un documento con payload válido', async () => {
      const response = await request(app)
        .post('/documents')
        .send({
          documentId: 'test-doc-001',
          thirdPartyEmail: 'test@example.com',
          fileUrl: 'https://example.com/file.pdf',
          callbackUrl: 'http://localhost:3000/webhooks/absign',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message');
      expect(response.body.document).toHaveProperty('id', 'test-doc-001');
      expect(response.body.document.status).toBe('sent');
    });

    it('debe crear un documento sin documentId y generar uno automáticamente', async () => {
      const response = await request(app)
        .post('/documents')
        .send({
          thirdPartyEmail: 'autoid@example.com',
          fileUrl: 'https://example.com/file.pdf',
          callbackUrl: 'http://localhost:3000/webhooks/absign',
        });

      expect(response.status).toBe(201);
      expect(response.body.document).toHaveProperty('id');
      expect(response.body.document.id).toMatch(/^[0-9a-fA-F-]{36}$/);
      expect(response.body.document.status).toBe('sent');
    });

    it('debe rechazar documentId duplicado con 409', async () => {
      const duplicateId = 'duplicate-doc-001';
      await request(app)
        .post('/documents')
        .send({
          documentId: duplicateId,
          thirdPartyEmail: 'test@example.com',
          fileUrl: 'https://example.com/file.pdf',
          callbackUrl: 'http://localhost:3000/webhooks/absign',
        });

      const response = await request(app)
        .post('/documents')
        .send({
          documentId: duplicateId,
          thirdPartyEmail: 'test@example.com',
          fileUrl: 'https://example.com/file.pdf',
          callbackUrl: 'http://localhost:3000/webhooks/absign',
        });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');
    });

    it('debe rechazar payload con email inválido', async () => {
      const response = await request(app)
        .post('/documents')
        .send({
          documentId: 'test-doc-002',
          thirdPartyEmail: 'email-invalido',
          fileUrl: 'https://example.com/file.pdf',
          callbackUrl: 'http://localhost:3000/webhooks/absign',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('debe rechazar payload con URL inválida', async () => {
      const response = await request(app)
        .post('/documents')
        .send({
          documentId: 'test-doc-003',
          thirdPartyEmail: 'test@example.com',
          fileUrl: 'not-a-url',
          callbackUrl: 'http://localhost:3000/webhooks/absign',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('debe rechazar payload con campos faltantes', async () => {
      const response = await request(app)
        .post('/documents')
        .send({
          documentId: 'test-doc-004',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /documents/:id/status', () => {
    it('debe retornar 404 para documento no existente', async () => {
      const response = await request(app)
        .get('/documents/non-existent/status');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /health', () => {
    it('debe retornar estado ok', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('POST /webhooks/absign', () => {
    it('debe procesar webhook con firma válida', async () => {
      const documentId = 'test-doc-webhook-001';
      await request(app)
        .post('/documents')
        .send({
          documentId,
          thirdPartyEmail: 'test@example.com',
          fileUrl: 'https://example.com/file.pdf',
          callbackUrl: 'http://localhost:3000/webhooks/absign',
        });

      const webhookPayload = {
        documentId,
        status: 'approved',
        reason: 'Documento aprobado exitosamente',
        timestamp: new Date().toISOString(),
      };
      const signature = generateSortedHmac(
        webhookPayload,
        process.env.HMAC_SECRET || 'dev-secret'
      );

      const response = await request(app)
        .post('/webhooks/absign')
        .set('X-Signature', signature)
        .send({
          ...webhookPayload,
          signature,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('documentId', documentId);
      expect(response.body).toHaveProperty('status', 'approved');
    });

    it('debe rechazar webhook con firma inválida', async () => {
      const webhookPayload = {
        documentId: 'test-doc-webhook-002',
        status: 'approved',
        reason: 'Documento aprobado erroneamente',
        timestamp: new Date().toISOString(),
      };

      const response = await request(app)
        .post('/webhooks/absign')
        .set('X-Signature', '0'.repeat(64))
        .send({
          ...webhookPayload,
          signature: '0'.repeat(64),
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('debe procesar idempotentemente el mismo evento dos veces', async () => {
      const documentId = 'test-doc-idempotent-001';
      
      // Crear documento primero
      await request(app)
        .post('/documents')
        .send({
          documentId,
          thirdPartyEmail: 'idempotent@example.com',
          fileUrl: 'https://example.com/file.pdf',
          callbackUrl: 'http://localhost:3000/webhooks/absign',
        });

      // Preparar payload del webhook
      const webhookPayload = {
        documentId,
        status: 'approved',
        reason: 'Primera vez',
        timestamp: new Date().toISOString(),
      };
      const signature = generateSortedHmac(
        webhookPayload,
        process.env.HMAC_SECRET || 'dev-secret'
      );

      const webhookBody = {
        ...webhookPayload,
        signature,
      };

      // Primer envío - debe procesarse
      const firstResponse = await request(app)
        .post('/webhooks/absign')
        .set('X-Signature', signature)
        .send(webhookBody);

      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body).toHaveProperty('message');

      // Segundo envío con el mismo payload - debe ser idempotente
      const secondResponse = await request(app)
        .post('/webhooks/absign')
        .set('X-Signature', signature)
        .send(webhookBody);

      expect(secondResponse.status).toBe(200);
      expect(secondResponse.body).toHaveProperty('message', 'Evento ya procesado (idempotente)');
      expect(secondResponse.body).toHaveProperty('documentId', documentId);
      expect(secondResponse.body).toHaveProperty('status', 'approved');
    });
  });

  describe('POST /documents/:id/simulate-webhook', () => {
    it('debe generar y enviar el webhook simulado con firma HMAC', async () => {
      const axiosPostSpy = vi.spyOn(axios, 'post').mockResolvedValue({ status: 200 } as any);

      const documentId = 'simulate-doc-001';
      await request(app)
        .post('/documents')
        .send({
          documentId,
          thirdPartyEmail: 'simulate@example.com',
          fileUrl: 'https://example.com/file.pdf',
          callbackUrl: 'http://localhost:3000/webhooks/absign',
        });

      const response = await request(app)
        .post(`/documents/${documentId}/simulate-webhook`)
        .send({ status: 'approved', reason: 'Simulated approval' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Webhook simulado enviado exitosamente');
      expect(axiosPostSpy).toHaveBeenCalled();
      const [url, body, config] = axiosPostSpy.mock.calls[0];
      expect(url).toBe('http://localhost:3000/webhooks/absign');
      expect(body).toHaveProperty('signature');
      expect(body).toMatchObject({
        documentId,
        status: 'approved',
        reason: 'Simulated approval',
      });
      expect(config.headers['X-Signature']).toBe(body.signature);

      axiosPostSpy.mockRestore();
    });
  });

  describe('GET /documents', () => {
    it('debe listar documentos con paginación', async () => {
      await request(app)
        .post('/documents')
        .send({
          documentId: 'list-doc-001',
          thirdPartyEmail: 'test1@example.com',
          fileUrl: 'https://example.com/file1.pdf',
          callbackUrl: 'http://localhost:3000/webhooks/absign',
        });

      await request(app)
        .post('/documents')
        .send({
          documentId: 'list-doc-002',
          thirdPartyEmail: 'test2@example.com',
          fileUrl: 'https://example.com/file2.pdf',
          callbackUrl: 'http://localhost:3000/webhooks/absign',
        });

      const response = await request(app).get('/documents?limit=1&offset=0');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBe(1);
      expect(response.body.pagination).toMatchObject({
        limit: 1,
        offset: 0,
      });
      expect(response.body.pagination.total).toBeGreaterThanOrEqual(2);
    });

    it('debe filtrar documentos por status', async () => {
      const response = await request(app).get('/documents?status=sent');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.every((doc: any) => doc.status === 'sent')).toBe(true);
    });

    it('debe rechazar filtro de status inválido', async () => {
      const response = await request(app).get('/documents?status=invalid-status');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });
});