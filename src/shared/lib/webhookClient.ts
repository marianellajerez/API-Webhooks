import axios from 'axios';

/**
 * Cliente HTTP para enviar documentos a Sistema B (mock)
 * Maneja timeouts, errores y reintentos con backoff
 */

interface DocumentPayload {
  documentId: string;
  thirdPartyEmail: string;
  fileUrl: string;
  callbackUrl: string;
}

interface WebhookPayload {
  documentId: string;
  status: 'approved' | 'rejected';
  reason?: string;
  timestamp: string;
  signature: string;
}

/**
 * Envía un documento a Sistema B con reintentos y backoff exponencial
 */
export async function sendDocumentToSistemaB(
  sistemaBUrl: string,
  payload: DocumentPayload,
  maxRetries: number = 3
): Promise<{ success: boolean; data?: any; error?: string }> {
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(`${sistemaBUrl}/documents`, payload, {
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' },
      });

      return { success: true, data: response.data };
    } catch (error: any) {
      lastError = error?.message || 'Error desconocido';
      console.warn(`Intento ${attempt}/${maxRetries} fallido: ${lastError}`);

      if (attempt < maxRetries) {
        const delay = 200 * attempt; // Backoff exponencial
        console.log(`Reintentando en ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return { success: false, error: `Error después de ${maxRetries} intentos: ${lastError}` };
}

/**
 * Envía un webhook a Sistema A con reintentos y backoff exponencial
 * Este es el cliente que usa Sistema B para notificar a Sistema A
 */
export async function sendWebhookToSistemaA(
  callbackUrl: string,
  payload: WebhookPayload,
  signature: string,
  maxRetries: number = 3
): Promise<{ success: boolean; error?: string }> {
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await axios.post(callbackUrl, payload, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': signature,
        },
      });

      return { success: true };
    } catch (error: any) {
      lastError = error?.message || 'Error desconocido';
      console.warn(`Intento ${attempt}/${maxRetries} fallido: ${lastError}`);

      if (attempt < maxRetries) {
        const delay = 200 * attempt; // Backoff exponencial
        console.log(`Reintentando webhook en ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  return { success: false, error: `Error después de ${maxRetries} intentos: ${lastError}` };
}