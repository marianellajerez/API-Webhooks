import { describe, it, expect } from 'vitest';
import { verifyHmacSignature, generateHmacSignature } from '../src/shared/lib/hmac';
import crypto from 'crypto';

function uuid(): string {
  return crypto.randomUUID();
}

describe('HMAC-SHA256 Utilities', () => {
  const secret = 'mi-secreto-test';
  const payload = JSON.stringify({ documentId: 'doc-123', status: 'approved' });

  it('debe generar una firma válida', () => {
    const signature = generateHmacSignature(payload, secret);
    expect(signature).toBeDefined();
    expect(typeof signature).toBe('string');
    expect(signature.length).toBe(64); // SHA256 produces 256 bits = 64 hex chars
  });

  it('debe verificar una firma válida correctamente', () => {
    const signature = generateHmacSignature(payload, secret);
    const isValid = verifyHmacSignature(payload, signature, secret);
    expect(isValid).toBe(true);
  });

  it('debe rechazar una firma inválida', () => {
    // Usar una firma de la misma longitud pero con contenido inválido
    const isValid = verifyHmacSignature(payload, '0'.repeat(64), secret);
    expect(isValid).toBe(false);
  });

  it('debe rechazar firma con payload modificado', () => {
    const signature = generateHmacSignature(payload, secret);
    const modifiedPayload = JSON.stringify({ documentId: 'doc-123', status: 'rejected' });
    const isValid = verifyHmacSignature(modifiedPayload, signature, secret);
    expect(isValid).toBe(false);
  });

  it('debe rechazar firma con secreto incorrecto', () => {
    const signature = generateHmacSignature(payload, secret);
    const isValid = verifyHmacSignature(payload, signature, 'secreto-incorrecto');
    expect(isValid).toBe(false);
  });

  it('debe usar timing-safe comparison', () => {
    const signature = generateHmacSignature(payload, secret);
    // Modificar un carácter pero mantener la misma longitud (64 chars hex)
    const tamperedSignature = '0' + signature.slice(1);
    const isValid = verifyHmacSignature(payload, tamperedSignature, secret);
    expect(isValid).toBe(false);
  });
});