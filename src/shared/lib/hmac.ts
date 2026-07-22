import crypto from 'crypto';

/**
 * Verifica la firma HMAC-SHA256 de un payload
 * @param payload - El payload JSON original
 * @param signature - La firma recibida en el header X-Signature
 * @param secret - El secreto compartido
 * @returns true si la firma es válida
 */
export function verifyHmacSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  try {
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Genera una firma HMAC-SHA256 para un payload
 * @param payload - El payload JSON a firmar
 * @param secret - El secreto compartido
 * @returns La firma en hexadecimal
 */
export function generateHmacSignature(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}