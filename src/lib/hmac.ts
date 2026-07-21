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

  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
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