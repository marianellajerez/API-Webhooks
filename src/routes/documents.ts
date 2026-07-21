import { Router } from 'express';
import { generateHmacSignature } from '../lib/hmac';
import { createDocument, getDocumentById, updateDocumentStatus, createIncident } from '../lib/dbOperations';
import { createDocumentSchema } from '../lib/zodSchemas';
import { emitIncident } from '../lib/socket';
import axios from 'axios';
import crypto from 'crypto';

function uuid(): string {
  return crypto.randomUUID();
}

const router = Router();

/**
 * POST /documents
 * Sistema A envía un documento a Sistema B (mock)
 */
router.post('/', async (req, res) => {
  try {
    // Validar payload con Zod
    const parsed = createDocumentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Payload inválido',
        details: parsed.error.issues,
      });
    }

    const { documentId, thirdPartyEmail, fileUrl, callbackUrl } = parsed.data;

    // Generar ID si no se proporciona
    const id = documentId || uuid();

    if (documentId) {
      const existingDocument = await getDocumentById(documentId);
      if (existingDocument) {
        return res.status(409).json({
          error: 'documentId ya existe',
          message: 'El documentId proporcionado ya está registrado',
          documentId,
        });
      }
    }

    // Crear documento en BD
    const document = await createDocument({
      id,
      thirdPartyEmail,
      fileUrl,
      callbackUrl,
    });

    // Simular envío a Sistema B (mock)
    // En producción, esto sería una llamada real a la API de Sistema B
    try {
      // Simular delay de red
      await new Promise(resolve => setTimeout(resolve, 500));

      // Actualizar estado a "sent"
      const updatedDocument = await updateDocumentStatus(id, 'sent', { sentAt: new Date() });

      return res.status(201).json({
        message: 'Documento enviado exitosamente',
        document: {
          id: updatedDocument.id,
          status: updatedDocument.status,
          sentAt: updatedDocument.sentAt,
        },
      });
    } catch (error: any) {
      // Registrar incidencia
      await createIncident({
        id: uuid(),
        type: 'send_failure',
        documentId: id,
        details: error.message || 'Error al enviar documento a Sistema B',
      });

      return res.status(502).json({
        error: 'Error al enviar documento a Sistema B',
        documentId: id,
      });
    }
  } catch (error: any) {
    console.error('Error en POST /documents:', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message,
    });
  }
});

/**
 * Simula el envío de un webhook desde Sistema B hacia Sistema A
 * Este endpoint es para testing/demostración
 */
router.post('/:id/simulate-webhook', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    // Verificar que el documento existe
    const document = await getDocumentById(id);
    if (!document) {
      return res.status(404).json({
        error: 'Documento no encontrado',
      });
    }

    // Generar payload del webhook sin la firma para firmar correctamente
    const webhookPayload = {
      documentId: id,
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

    async function sleep(ms: number) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function sendWebhookWithRetries(url: string, body: any, headers: any) {
      const attempts = 3;
      let attempt = 0;
      let lastError: any = null;

      while (attempt < attempts) {
        try {
          await axios.post(url, body, {
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

    // Enviar webhook al callbackUrl del documento con retries/backoff
    try {
      await sendWebhookWithRetries(document.callbackUrl, webhookBody, {
        'Content-Type': 'application/json',
        'X-Signature': signature,
      });

      return res.status(200).json({
        message: 'Webhook simulado enviado exitosamente',
        payload: webhookPayload,
      });
    } catch (error: any) {
      const details = error?.message || 'Error al enviar webhook simulado';

      // Registrar incidencia
      await createIncident({
        id: uuid(),
        type: 'webhook_send_failure',
        documentId: id,
        details,
      });

      await emitIncident(
        'webhook_send_failure',
        `No se pudo entregar webhook para documento ${id}: ${details}`,
        id
      );

      return res.status(502).json({
        error: 'Error al enviar webhook simulado',
        documentId: id,
        details,
      });
    }
  } catch (error: any) {
    console.error('Error en POST /documents/:id/simulate-webhook:', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message,
    });
  }
});

export default router;