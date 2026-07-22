import { Server } from 'socket.io';
import http from 'http';

let io: Server;

/**
 * Inicializa Socket.IO con el servidor HTTP
 */
export function initializeSocketIO(server: http.Server): Server {
  io = new Server(server, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`Socket conectado: ${socket.id}`);

    // Suscripción a room de documento
    socket.on('subscribe:document', (documentId: string) => {
      socket.join(`document:${documentId}`);
      console.log(`[SOCKET] ✅ Socket ${socket.id} se unió a room document:${documentId}`);
      console.log(`[SOCKET] 📋 Rooms actuales: ${JSON.stringify([...socket.rooms])}`);
    });

    // Suscripción a room de administradores
    socket.on('subscribe:admins', () => {
      socket.join('admins');
      console.log(`[SOCKET] ✅ Socket ${socket.id} se unió a room admins`);
      console.log(`[SOCKET] 📋 Rooms actuales: ${JSON.stringify([...socket.rooms])}`);
    });

    // Manejo de desconexión
    socket.on('disconnect', () => {
      console.log(`Socket desconectado: ${socket.id}`);
    });
  });

  console.log('Socket.IO inicializado');
  return io;
}

/**
 * Emite evento de cambio de estado de documento
 * Se dirige a la room específica del documento
 */
export async function emitDocumentStatusChanged(documentId: string, status: string, reason?: string) {
  if (!io) {
    console.warn('Socket.IO no está inicializado');
    return;
  }

  const payload = {
    documentId,
    status,
    reason: reason || undefined,
    timestamp: new Date().toISOString(),
  };

  // Emitir a la room específica del documento
  io.to('document:' + documentId).emit('document:statusChanged', payload);

  console.log('Evento emitido: document:statusChanged -> document:' + documentId, payload);
}

/**
 * Emite evento de incidencia
 * Se dirige a la room de administradores
 */
export async function emitIncident(type: string, details: string, documentId?: string) {
  if (!io) {
    console.warn('Socket.IO no está inicializado');
    return;
  }

  const payload = {
    type,
    details,
    documentId: documentId || null,
    timestamp: new Date().toISOString(),
  };

  // Emitir a la room de administradores
  io.to('admins').emit('integration:incident', payload);

  // También emitir a la room del documento para visibilidad del cliente
  if (documentId) {
    io.to('document:' + documentId).emit('integration:incident', payload);
  }

  var logMsg = 'Incidente emitido: integration:incident -> admins';
  if (documentId) {
    logMsg += ' + document:' + documentId;
  }
  console.log(logMsg, payload);
}

/**
 * Obtiene la instancia de Socket.IO
 */
export function getSocketIO(): Server {
  if (!io) {
    throw new Error('Socket.IO no está inicializado. Llama a initializeSocketIO primero.');
  }
  return io;
}