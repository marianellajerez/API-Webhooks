import { describe, it, expect } from 'vitest';
import { createDocumentSchema, webhookPayloadSchema } from '../src/lib/zodSchemas';
import crypto from 'crypto';

function uuid(): string {
  return crypto.randomUUID();
}

describe('Zod Schemas - CreateDocument', () => {
  it('debe validar payload completo', () => {
    const result = createDocumentSchema.safeParse({
      documentId: 'doc-001',
      thirdPartyEmail: 'test@example.com',
      fileUrl: 'https://example.com/file.pdf',
      callbackUrl: 'http://localhost:3000/webhooks/absign',
    });

    expect(result.success).toBe(true);
  });

  it('debe rechazar email inválido', () => {
    const result = createDocumentSchema.safeParse({
      documentId: 'doc-001',
      thirdPartyEmail: 'not-an-email',
      fileUrl: 'https://example.com/file.pdf',
      callbackUrl: 'http://localhost:3000/webhooks/absign',
    });

    expect(result.success).toBe(false);
  });

  it('debe rechazar URL inválida', () => {
    const result = createDocumentSchema.safeParse({
      documentId: 'doc-001',
      thirdPartyEmail: 'test@example.com',
      fileUrl: 'not-a-url',
      callbackUrl: 'http://localhost:3000/webhooks/absign',
    });

    expect(result.success).toBe(false);
  });

  it('debe rechazar campos faltantes', () => {
    const result = createDocumentSchema.safeParse({
      documentId: 'doc-001',
    });

    expect(result.success).toBe(false);
  });
});

describe('Zod Schemas - WebhookPayload', () => {
  it('debe validar payload de webhook completo', () => {
    const result = webhookPayloadSchema.safeParse({
      documentId: 'doc-001',
      status: 'approved',
      reason: 'All documents verified',
      timestamp: new Date().toISOString(),
      signature: 'abc123',
    });

    expect(result.success).toBe(true);
  });

  it('debe validar webhook sin reason (opcional)', () => {
    const result = webhookPayloadSchema.safeParse({
      documentId: 'doc-001',
      status: 'rejected',
      timestamp: new Date().toISOString(),
      signature: 'abc123',
    });

    expect(result.success).toBe(true);
  });

  it('debe rechazar status inválido', () => {
    const result = webhookPayloadSchema.safeParse({
      documentId: 'doc-001',
      status: 'invalid-status',
      timestamp: new Date().toISOString(),
      signature: 'abc123',
    });

    expect(result.success).toBe(false);
  });

  it('debe rechazar timestamp inválido', () => {
    const result = webhookPayloadSchema.safeParse({
      documentId: 'doc-001',
      status: 'approved',
      timestamp: 'not-a-date',
      signature: 'abc123',
    });

    expect(result.success).toBe(false);
  });

  it('debe rechazar signature faltante', () => {
    const result = webhookPayloadSchema.safeParse({
      documentId: 'doc-001',
      status: 'approved',
      timestamp: new Date().toISOString(),
    });

    expect(result.success).toBe(false);
  });
});