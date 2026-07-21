import { db, documents, webhookEvents, incidents } from '../db/index';
import { eq, and, desc, sql } from 'drizzle-orm';
import crypto from 'crypto';

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Crea un nuevo documento en la base de datos
 */
export async function createDocument(params: {
  id: string;
  thirdPartyEmail: string;
  fileUrl: string;
  callbackUrl: string;
}) {
  const newDocument = await db
    .insert(documents)
    .values({
      id: params.id,
      thirdPartyEmail: params.thirdPartyEmail,
      fileUrl: params.fileUrl,
      callbackUrl: params.callbackUrl,
      status: 'pending',
    })
    .returning();

  return newDocument[0];
}

/**
 * Obtiene un documento por su ID
 */
export async function getDocumentById(documentId: string) {
  const result = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  return result[0] || null;
}

export async function listDocuments(options: {
  limit: number;
  offset: number;
  status?: string;
}) {
  const query = db
    .select()
    .from(documents)
    .orderBy(desc(documents.createdAt))
    .limit(options.limit)
    .offset(options.offset);

  if (options.status) {
    query.where(eq(documents.status, options.status as any));
  }

  return await query;
}

export async function countDocuments(status?: string) {
  const countQuery = db
    .select({ count: sql`count(*)` })
    .from(documents);

  if (status) {
    countQuery.where(eq(documents.status, status as any));
  }

  const result = await countQuery;
  return Number(result[0].count);
}

/**
 * Actualiza el estado de un documento
 */
export async function updateDocumentStatus(documentId: string, status: string, extraFields: Record<string, any> = {}) {
  const updated = await db
    .update(documents)
    .set({
      status: status as any,
      ...extraFields,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId))
    .returning();

  return updated[0];
}

/**
 * Registra un evento de webhook
 */
export async function createWebhookEvent(params: {
  id: string;
  documentId: string;
  payload: any;
  status: 'received' | 'processed' | 'failed';
  errorMessage?: string;
  processedAt?: Date;
}) {
  const newEvent = await db
    .insert(webhookEvents)
    .values({
      id: params.id,
      documentId: params.documentId,
      payload: params.payload,
      status: params.status,
      errorMessage: params.errorMessage,
      processedAt: params.processedAt || (params.status === 'processed' ? new Date() : null),
    })
    .returning();

  return newEvent[0];
}

/**
 * Verifica si un evento ya fue procesado (idempotencia)
 */
export async function isEventProcessed(documentId: string, status: string): Promise<boolean> {
  const result = await db
    .select()
    .from(webhookEvents)
    .where(and(
      eq(webhookEvents.documentId, documentId),
      eq(webhookEvents.status, 'processed'),
      sql`(${webhookEvents.payload}->>'status') = ${status}`
    ))
    .limit(1);

  return result.length > 0;
}

/**
 * Registra una incidencia
 */
export async function createIncident(params: {
  id: string;
  type: string;
  documentId?: string;
  details: string;
}) {
  const newIncident = await db
    .insert(incidents)
    .values({
      id: params.id,
      type: params.type,
      documentId: params.documentId || null,
      details: params.details,
    })
    .returning();

  return newIncident[0];
}

/**
 * Obtiene el historial de eventos de un documento
 */
export async function getDocumentEvents(documentId: string) {
  const result = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.documentId, documentId))
    .orderBy(desc(webhookEvents.receivedAt));

  return result;
}