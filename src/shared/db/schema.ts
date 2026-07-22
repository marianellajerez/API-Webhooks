import { pgTable, text, timestamp, varchar, pgEnum, json, unique } from 'drizzle-orm/pg-core';

// Enum para el estado de los documentos
export const documentStatusEnum = pgEnum('document_status', ['pending', 'sent', 'approved', 'rejected']);

// Enum para el estado del webhook
export const webhookStatusEnum = pgEnum('webhook_status', ['received', 'processed', 'failed']);

// Tabla de documentos
export const documents = pgTable('documents', {
  id: varchar('id').primaryKey().notNull(),
  status: documentStatusEnum('status').notNull().default('pending'),
  thirdPartyEmail: text('third_party_email').notNull(),
  fileUrl: text('file_url').notNull(),
  callbackUrl: text('callback_url').notNull(),
  sentAt: timestamp('sent_at'),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Tabla de eventos de webhook (auditoría e idempotencia)
export const webhookEvents = pgTable('webhook_events', {
  id: varchar('id').primaryKey().notNull(),
  documentId: varchar('document_id')
    .references(() => documents.id)
    .notNull(),
  payload: json('payload').notNull(),
  status: webhookStatusEnum('status').notNull().default('received'),
  receivedAt: timestamp('received_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  // Constraint único para garantizar idempotencia a nivel de base de datos
  // Evita procesar el mismo documento con el mismo estado dos veces
  uniqueDocumentStatus: unique('unique_document_status').on(table.documentId, table.status),
}));

// Tabla de incidencias (para logging de errores e incidentes)
export const incidents = pgTable('incidents', {
  id: varchar('id').primaryKey().notNull(),
  type: text('type').notNull(), // 'timeout', 'connection_failure', 'invalid_signature', 'retry_exhausted'
  documentId: varchar('document_id').references(() => documents.id),
  details: text('details').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type NewWebhookEvent = typeof webhookEvents.$inferInsert;

export type Incident = typeof incidents.$inferSelect;
export type NewIncident = typeof incidents.$inferInsert;