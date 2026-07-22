import { Router, Request, Response } from 'express';
import { getDocumentById, createIncident } from '../../shared/lib/dbOperations';
import { generateHmacSignature } from '../../shared/lib/hmac';
import { emitIncident } from '../../shared/lib/socket';
import { simulateWebhookSending } from '../../shared/lib/sistemaBSimulator';
import crypto from 'crypto';

function uuid(): string {
  return crypto.randomUUID();
}

const router = Router();

/**
 * POST /documents/:id/simulate-webhook
 * Simula el envío de un webhook desde Sistema B hacia Sistema A
 * Este endpoint es para testing/demostración
 */
router.post('/:id/simulate-webhook', async (req: Request, res: Response) => {
  try {
    // Asegurar que id sea string (Express 5 puede devolver string | string[])
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { status, reason } = req.body;

    // Verificar que el documento existe
    const document = await getDocumentById(id);
    if (!document) {
      return res.status(404).json({
        error: 'Documento no encontrado',
      });
    }

    // Verificar idempotencia: si el documento ya tiene ese estado, no procesar de nuevo
    let finalStatus: 'approved' | 'rejected' = 'approved';
    if (status === 'approved' || status === 'rejected') {
      finalStatus = status;
    }
    if (document.status === finalStatus) {
      return res.status(200).json({
        message: 'Evento ya procesado (idempotente)',
        documentId: id,
        status: document.status,
        resolvedAt: document.resolvedAt,
      });
    }

    // Simular envío del webhook
    const result = await simulateWebhookSending(id, finalStatus, reason);

    if (result.success) {
      // Obtener el documento actualizado para devolver los datos completos
      const updatedDocument = await getDocumentById(id);
      return res.status(200).json({
        message: 'Webhook simulado enviado exitosamente',
        status: result.webhookPayload?.status || 'approved',
        resolvedAt: updatedDocument?.resolvedAt || new Date().toISOString(),
        document: updatedDocument,
      });
    } else {
      return res.status(500).json({
        error: 'Error al enviar webhook simulado',
        documentId: id,
        details: result.error,
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