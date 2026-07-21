import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { db, documents, webhookEvents, incidents } from '../src/db';
import crypto from 'crypto';

function uuid(): string {
  return crypto.randomUUID();
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
});