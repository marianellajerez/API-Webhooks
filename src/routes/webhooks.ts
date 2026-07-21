import { Router, Request, Response } from 'express';
import { verifyHmacSignature } from '../lib/hmac';
import { webhookPayloadSchema } from '../lib/zodSchemas';
import { createWebhookEvent, isEventProcessed, updateDocumentStatus, createIncident } from '../lib/dbOperations';
import { emitDocumentStatusChanged, emitIncident } from '../lib/socket';
import crypto from 'crypto';

function uuid(): string {
  return crypto.randomUUID();
}

const router = Router();

/**
 * POST /webhooks/absign
 * Recibe webhooks de Sistema B (Plataforma de Firma)
 * Verifica firma HMAC, asegura idempotencia y actualiza estado
 */
router.post('/absign', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-signature'] as string;
    const hmacSecret = process.env.HMAC_SECRET || 'dev-secret';

    // 1. Verificar firma HMAC (sin incluir el campo signature en el payload)
    const payloadForVerify = { ...req.body };
    delete payloadForVerify.signature;
    const payloadString = JSON.stringify(payloadForVerify);
    
    if (!signature || !verifyHmacSignature(payloadString, signature, hmacSecret)) {
      const details = `Firma HMAC inválida recibida. Payload: ${payloadString}`;
      await createIncident({
        id: uuid(),
        type: 'invalid_signature',
        details,
      });

      const documentId = payloadForVerify.documentId || null;
      await emitIncident('invalid_signature', details, documentId ?? undefined);

      return res.status(401).json({
        error: 'Firma HMAC inválida',
        message: 'El webhook no fue autorizado. Verifica la firma.',
      });
    }

    // 2. Validar payload con Zod
    const parsed = webhookPayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Payload del webhook inválido',
        details: parsed.error.issues,
      });
    }

    const { documentId, status, reason, timestamp } = parsed.data;

    // 3. Verificar idempotencia
    const alreadyProcessed = await isEventProcessed(documentId, status);
    if (alreadyProcessed) {
      return res.status(200).json({
        message: 'Evento ya procesado (idempotente)',
        documentId,
        status,
      });
    }

    // 4. Registrar evento de webhook
    const eventId = uuid();
    await createWebhookEvent({
      id: eventId,
      documentId,
      payload: parsed.data,
      status: 'received',
    });

    // 5. Actualizar estado del documento
    const extraFields: Record<string, any> = {
      resolvedAt: new Date(),
    };

    if (status === 'approved') {
      await updateDocumentStatus(documentId, 'approved', extraFields);
    } else if (status === 'rejected') {
      await updateDocumentStatus(documentId, 'rejected', { ...extraFields, reason });

      // Registrar evento de rechazo
      await createWebhookEvent({
        id: uuid(),
        documentId,
        payload: { ...parsed.data, reason },
        status: 'processed',
        processedAt: new Date(),
      });

      // Emitir evento Socket.IO para rechazo
      await emitDocumentStatusChanged(documentId, status, reason);

      return res.status(200).json({
        message: 'Webhook procesado - Documento rechazado',
        documentId,
        status,
        reason,
      });
    }

    // 6. Marcar evento como procesado
    await createWebhookEvent({
      id: uuid(),
      documentId,
      payload: parsed.data,
      status: 'processed',
      processedAt: new Date(),
    });

    // 7. Emitir evento Socket.IO en tiempo real
    await emitDocumentStatusChanged(documentId, status, reason);

    return res.status(200).json({
      message: 'Webhook procesado exitosamente',
      documentId,
      status,
    });
  } catch (error: any) {
    console.error('Error en POST /webhooks/absign:', error);

    await createIncident({
      id: uuid(),
      type: 'webhook_processing_error',
      details: `Error al procesar webhook: ${error.message}`,
    });

    return res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message,
    });
  }
});

export default router;