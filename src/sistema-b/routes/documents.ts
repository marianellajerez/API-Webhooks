import { Router } from 'express';
import { generateHmacSignature } from '../../shared/lib/hmac';
import { createDocument, getDocumentById, updateDocumentStatus, createIncident } from '../../shared/lib/dbOperations';
import { createDocumentSchema } from '../../shared/lib/zodSchemas';
import { emitIncident } from '../../shared/lib/socket';
import { sendWebhookToSistemaA } from '../../shared/lib/webhookClient';
import crypto from 'crypto';

function uuid(): string {
  return crypto.randomUUID();
}

const router = Router();

/**
 * POST /documents
 * Sistema B (mock) recibe un documento de Sistema A
 * Simula el proceso de firma y envía webhook de resultado
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

    // Simular proceso de firma (mock)
    try {
      // Simular delay de procesamiento
      await new Promise(resolve => setTimeout(resolve, 500));

      // Simular decisión de firma (aprobado por defecto)
      const status: 'approved' | 'rejected' = 'approved';
      const reason = undefined;

      // Generar payload del webhook
      const webhookPayload = {
        documentId: id,
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

      // Enviar webhook al callbackUrl con reintentos
      const webhookResult = await sendWebhookToSistemaA(callbackUrl, webhookBody, signature);

      if (webhookResult.success) {
        // Actualizar estado a "approved"
        const updatedDocument = await updateDocumentStatus(id, 'approved', {
          resolvedAt: new Date(),
        });

        return res.status(200).json({
          message: 'Documento firmado exitosamente',
          document: {
            id: updatedDocument.id,
            status: updatedDocument.status,
            resolvedAt: updatedDocument.resolvedAt,
          },
        });
      } else {
        // Registrar incidencia
        await createIncident({
          id: uuid(),
          type: 'webhook_send_failure',
          documentId: id,
          details: webhookResult.error || 'Error al enviar webhook a Sistema A',
        });

        await emitIncident(
          'webhook_send_failure',
          `No se pudo entregar webhook para documento ${id}: ${webhookResult.error}`,
          id
        );

        // Actualizar estado de todos modos (firma completada, pero no se pudo notificar)
        const updatedDocument = await updateDocumentStatus(id, status, {
          resolvedAt: new Date(),
        });

        return res.status(200).json({
          message: 'Documento firmado, pero error al notificar a Sistema A',
          document: {
            id: updatedDocument.id,
            status: updatedDocument.status,
            resolvedAt: updatedDocument.resolvedAt,
          },
          warning: 'Webhook no entregado - usar reconciliación',
        });
      }
    } catch (error: any) {
      // Registrar incidencia
      await createIncident({
        id: uuid(),
        type: 'sign_failure',
        documentId: id,
        details: error.message || 'Error al firmar documento',
      });

      return res.status(500).json({
        error: 'Error al firmar documento',
        documentId: id,
      });
    }
  } catch (error: any) {
    console.error('Error en POST /documents (Sistema B):', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message,
    });
  }
});

export default router;