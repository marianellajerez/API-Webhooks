import { Router } from 'express';
import { generateHmacSignature } from '../lib/hmac';
import { createDocument, getDocumentById, updateDocumentStatus, createIncident } from '../lib/dbOperations';
import { createDocumentSchema } from '../lib/zodSchemas';
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

    // Generar payload del webhook
    const webhookPayload = {
      documentId: id,
      status: status || 'approved',
      reason: reason || undefined,
      timestamp: new Date().toISOString(),
      signature: '', // Se generará después
    };

    // Generar firma HMAC
    const payloadString = JSON.stringify(webhookPayload);
    webhookPayload.signature = generateHmacSignature(payloadString, process.env.HMAC_SECRET || 'dev-secret');

    // Enviar webhook al callbackUrl del documento
    try {
      await axios.post(document.callbackUrl, webhookPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': webhookPayload.signature,
        },
        timeout: 5000,
      });

      return res.status(200).json({
        message: 'Webhook simulado enviado exitosamente',
        payload: webhookPayload,
      });
    } catch (error: any) {
      // Registrar incidencia
      await createIncident({
        id: uuid(),
        type: 'webhook_send_failure',
        documentId: id,
        details: error.message || 'Error al enviar webhook simulado',
      });

      return res.status(502).json({
        error: 'Error al enviar webhook simulado',
        documentId: id,
        details: error.message,
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