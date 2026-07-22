import { z } from 'zod';

/**
 * Schema para validar la creación de un documento
 * POST /documents
 */
export const createDocumentSchema = z.object({
  documentId: z.string().min(1, 'documentId es requerido').optional(),
  thirdPartyEmail: z.string().email('Email del tercero no válido'),
  fileUrl: z.string().url('fileUrl debe ser una URL válida'),
  callbackUrl: z.string().url('callbackUrl debe ser una URL válida'),
});

export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

/**
 * Schema para validar el payload del webhook
 * POST /webhooks/absign
 */
export const webhookPayloadSchema = z.object({
  documentId: z.string().min(1, 'documentId es requerido'),
  status: z.enum(['approved', 'rejected'], 'status debe ser approved o rejected'),
  reason: z.string().optional(),
  timestamp: z.string().datetime({ message: 'timestamp debe ser una fecha ISO válida' }),
  signature: z.string().min(1, 'signature es requerida'),
});

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

/**
 * Schema para validar la respuesta de reconciliación
 */
export const documentStatusResponseSchema = z.object({
  documentId: z.string(),
  status: z.enum(['pending', 'sent', 'approved', 'rejected']),
  thirdPartyEmail: z.string(),
  sentAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type DocumentStatusResponse = z.infer<typeof documentStatusResponseSchema>;