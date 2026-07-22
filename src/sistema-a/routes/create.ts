import { Router } from 'express';
import { createDocument, getDocumentById, updateDocumentStatus, createIncident } from '../../shared/lib/dbOperations';
import { createDocumentSchema } from '../../shared/lib/zodSchemas';
import { emitIncident } from '../../shared/lib/socket';
import { simulateSistemaBSigning } from '../../shared/lib/sistemaBSimulator';
import crypto from 'crypto';

function uuid(): string {
  return crypto.randomUUID();
}

const router = Router();

/**
 * POST /documents
 * Sistema A crea un documento y lo envía a Sistema B (mock)
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

    // Crear documento en BD (estado: pending)
    const document = await createDocument({
      id,
      thirdPartyEmail,
      fileUrl,
      callbackUrl,
    });

    // Simular envío a Sistema B (mock)
    // En producción, esto sería una llamada HTTP real a la API de Sistema B
    try {
      // Simular delay de red
      await new Promise(resolve => setTimeout(resolve, 500));

      // Simular proceso de firma en Sistema B
      const result = await simulateSistemaBSigning(id, callbackUrl);

      if (result.success) {
        // Actualizar estado a "sent"
        const updatedDocument = await updateDocumentStatus(id, 'sent', { sentAt: new Date() });

        return res.status(201).json({
          message: 'Documento enviado exitosamente a Sistema B',
          document: {
            id: updatedDocument.id,
            status: updatedDocument.status,
            sentAt: updatedDocument.sentAt,
          },
        });
      } else {
        // Registrar incidencia
        await createIncident({
          id: uuid(),
          type: 'send_failure',
          documentId: id,
          details: result.error || 'Error al enviar documento a Sistema B',
        });

        await emitIncident(
          'send_failure',
          `No se pudo enviar documento ${id} a Sistema B: ${result.error}`,
          id
        );

        return res.status(502).json({
          error: 'Error al enviar documento a Sistema B',
          documentId: id,
          details: result.error,
        });
      }
    } catch (error: any) {
      // Registrar incidencia
      await createIncident({
        id: uuid(),
        type: 'send_failure',
        documentId: id,
        details: error.message || 'Error al enviar documento a Sistema B',
      });

      await emitIncident(
        'send_failure',
        `Error inesperado al enviar documento ${id} a Sistema B: ${error.message}`,
        id
      );

      return res.status(502).json({
        error: 'Error al enviar documento a Sistema B',
        documentId: id,
      });
    }
  } catch (error: any) {
    console.error('Error en POST /documents (Sistema A):', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message,
    });
  }
});

export default router;