import 'dotenv/config';
import express from 'express';
import http from 'http';
import documentsRoutes from './routes/documents';
import webhookRoutes from './routes/webhooks';
import reconciliationRoutes from './routes/reconciliation';
import { initializeSocketIO } from './lib/socket';

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

// Rutas
app.use('/documents', documentsRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/documents', reconciliationRoutes);

// Health check
app.get('/health', (_req: any, res: any) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Manejo de rutas no encontradas
app.use((_req: any, res: any) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Manejo de errores global
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
  });
}

export { app, server };