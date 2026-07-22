import { generateHmacSignature } from './hmac';
import { createDocument, getDocumentById, updateDocumentStatus, createIncident } from './dbOperations';
import { createDocumentSchema } from './zodSchemas';
import crypto from 'crypto';

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Simula el proceso de firma de Sistema B
 * Esta función se usa en tests y modo demo para no necesitar HTTP real
 * 
 * En producción, Sistema B sería un servicio separado y se usaría HTTP.
 * Aquí simulamos el proceso inline para el ejercicio.
 */
export async function simulateSistemaBSigning(documentId: string, callbackUrl: string): Promise<{
  success: boolean;
  status?: 'approved' | 'rejected';
  error?: string;
}> {
  try {
    // Simular delay de procesamiento
    await new Promise(resolve => setTimeout(resolve, 500));

    // Simular decisión de firma (aprobado por defecto)
    const status: 'approved' | 'rejected' = 'approved';
    const reason = undefined;

    // Generar payload del webhook
    const webhookPayload = {
      documentId,
      status,
      reason,
      timestamp: new Date().toISOString(),
    };

    // Generar firma HMAC
    const payloadString = JSON.stringify(webhookPayload);
    const signature = generateHmacSignature(payloadString, process.env.HMAC_SECRET || 'dev-secret');

    // Incluir la firma en el body
    const webhookBody = {
      ...webhookPayload,
      signature,
    };

    // Actualizar estado del documento a "approved"
    await updateDocumentStatus(documentId, 'approved', { resolvedAt: new Date() });

    return { success: true, status };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Simula el envío de un webhook desde Sistema B hacia Sistema A
 * Este endpoint es para testing/demostración
 */
export async function simulateWebhookSending(
  documentId: string,
  status?: 'approved' | 'rejected',
  reason?: string
): Promise<{
  success: boolean;
  webhookPayload?: any;
  error?: string;
}> {
  try {
    const document = await getDocumentById(documentId);
    if (!document) {
      return { success: false, error: 'Documento no encontrado' };
    }

    // Generar payload del webhook sin la firma para firmar correctamente
    const webhookPayload = {
      documentId,
      status: status || 'approved',
      reason: reason || undefined,
      timestamp: new Date().toISOString(),
    };

    // Generar firma HMAC sobre el payload sin la propiedad signature
    const payloadString = JSON.stringify(webhookPayload);
    const signature = generateHmacSignature(payloadString, process.env.HMAC_SECRET || 'dev-secret');

    // Incluir la firma en el body que se envía
    const webhookBody = {
      ...webhookPayload,
      signature,
    };

    // Enviar webhook al callbackUrl del documento con retries/backoff
    const axios = await import('axios');

    async function sleep(ms: number) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function sendWebhookWithRetries(url: string, body: any, headers: any) {
      const attempts = 3;
      let attempt = 0;
      let lastError: any = null;

      while (attempt < attempts) {
        try {
          await axios.default.post(url, body, {
            headers,
            timeout: 5000,
          });
          return;
        } catch (error: any) {
          lastError = error;
          attempt += 1;
          if (attempt >= attempts) {
            break;
          }
          await sleep(200 * attempt);
        }
      }

      throw lastError;
    }

    try {
      await sendWebhookWithRetries(document.callbackUrl, webhookBody, {
        'Content-Type': 'application/json',
        'X-Signature': signature,
      });

      return { success: true, webhookPayload };
    } catch (error: any) {
      const details = error?.message || 'Error al enviar webhook simulado';

      // Registrar incidencia
      await createIncident({
        id: uuid(),
        type: 'webhook_send_failure',
        documentId,
        details,
      });

      return { success: false, error: details };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}