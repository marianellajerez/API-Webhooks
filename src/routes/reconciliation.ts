import { Router, Request, Response } from 'express';
import { getDocumentById, getDocumentEvents } from '../lib/dbOperations';
import { documentStatusResponseSchema } from '../lib/zodSchemas';

const router = Router();

/**
 * GET /documents/:id/status
 * Endpoint de reconciliación - permite consultar el estado de un documento
 * Es el respaldo si nunca llegó el webhook por Socket.IO
 */
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Validar que el ID no esté vacío
    const docId = Array.isArray(id) ? id[0] : id;
    if (!docId || docId.trim() === '') {
      return res.status(400).json({
        error: 'ID de documento requerido',
      });
    }

    // Buscar documento
    const document = await getDocumentById(docId);
    if (!document) {
      return res.status(404).json({
        error: 'Documento no encontrado',
      });
    }

    // Obtener eventos del documento
    const events = await getDocumentEvents(docId);

    // Formatear respuesta
    const response = {
      documentId: document.id,
      status: document.status,
      thirdPartyEmail: document.thirdPartyEmail,
      sentAt: document.sentAt?.toISOString() || null,
      resolvedAt: document.resolvedAt?.toISOString() || null,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
      events: events.map((event: any) => ({
        id: event.id,
        status: event.status,
        payload: event.payload,
        receivedAt: event.receivedAt.toISOString(),
        processedAt: event.processedAt?.toISOString() || null,
        errorMessage: event.errorMessage || null,
      })),
    };

    // Validar respuesta con Zod
    const validated = documentStatusResponseSchema.safeParse(response);
    if (!validated.success) {
      return res.status(500).json({
        error: 'Error interno al formatear respuesta',
        details: validated.error.issues,
      });
    }

    return res.status(200).json(response);
  } catch (error: any) {
    console.error('Error en GET /documents/:id/status:', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message,
    });
  }
});

/**
 * GET /documents
 * Lista todos los documentos (con paginación básica)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { limit = 20, offset = 0, status } = req.query;

    // TODO: Implementar consulta con filtros y paginación
    // Por ahora, retornar estructura básica
    return res.status(200).json({
      message: 'Lista de documentos',
      data: [],
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total: 0,
      },
    });
  } catch (error: any) {
    console.error('Error en GET /documents:', error);
    return res.status(500).json({
      error: 'Error interno del servidor',
      details: error.message,
    });
  }
});

export default router;