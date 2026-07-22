import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import sistemaARoutes from './sistema-a/routes/create';
import sistemaAReconcileRoutes from './sistema-a/routes/reconcile';
import sistemaASimulateRoutes from './sistema-a/routes/simulate';
import webhookRoutes from './webhooks';
import { initializeSocketIO } from './shared/lib/socket';

const app = express();
const PORT: number = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: any, _res: any, next: any) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// =============================================
// Sistema A: Gestor de Documentos
// =============================================
// POST /documents - Crear y enviar documento a Sistema B
app.use('/documents', sistemaARoutes);

// GET /documents - Listar documentos
// GET /documents/:id/status - Reconciliación
app.use('/documents', sistemaAReconcileRoutes);

// POST /documents/:id/simulate-webhook - Simular webhook de Sistema B
app.use('/documents', sistemaASimulateRoutes);

// =============================================
// Sistema A: Webhook entrante de Sistema B
// =============================================
// POST /webhooks/absign - Recibe resultados de firma
app.use('/webhooks', webhookRoutes);

// =============================================
// Health check
// =============================================
app.get('/health', (_req: any, res: any) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    systems: {
      sistemaA: 'Gestor de Documentos',
      sistemaB: 'Plataforma de Firma (mock)',
    },
  });
});

// =============================================
// Mini frontend para Socket.IO en tiempo real
// =============================================
app.get('/socket-client', (_req: any, res: any) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'socket-client.html'));
});

// =============================================
// Manejo de rutas no encontradas
// =============================================
app.use((_req: any, res: any) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// =============================================
// Manejo de errores global
// =============================================
app.use((err: Error, _req: any, res: any, _next: any) => {
  console.error('Error no manejado:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Crear servidor HTTP (necesario para Express + Socket.IO)
const server = http.createServer(app);

// Inicializar Socket.IO
initializeSocketIO(server);

// Iniciar el servidor sólo si este módulo se ejecuta directamente
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Socket.IO disponible en http://localhost:${PORT}`);
    console.log('');
    console.log('Sistema A (Gestor de Documentos):');
    console.log('  POST /documents              - Crear documento');
    console.log('  GET  /documents              - Listar documentos');
    console.log('  GET  /documents/:id/status   - Reconciliación');
    console.log('  POST /webhooks/absign        - Recibir webhook de firma');
    console.log('');
    console.log('Sistema B (Plataforma de Firma mock):');
    console.log('  POST /documents              - Recibe documento de Sistema A');
  });
}

export { app, server };