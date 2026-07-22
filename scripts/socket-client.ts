/**
 * Cliente de prueba Socket.IO
 * 
 * Este script conecta como cliente Socket.IO, se suscribe a rooms,
 * y muestra en consola los eventos recibidos en tiempo real.
 * 
 * Uso:
 *   npm run socket:test
 * 
 * Flujo:
 *   1. Conectar al servidor Socket.IO
 *   2. Suscribirse a room de documento y admins
 *   3. Esperar eventos (statusChanged, incident)
 *   4. Crear un documento (dispara webhook simulado)
 *   5. Verificar que los eventos llegan al cliente
 */

import { io } from 'socket.io-client';

const SOCKET_URL = process.env.SOCKET_URL || 'http://localhost:3000';
const TEST_DOCUMENT_ID = 'test-socket-doc-' + Date.now();

interface StatusChangedEvent {
  documentId: string;
  status: string;
  reason?: string;
  timestamp: string;
}

interface IncidentEvent {
  type: string;
  details: string;
  documentId: string | null;
  timestamp: string;
}

/**
 * Conecta el cliente Socket.IO y configura listeners
 */
function createSocketClient() {
  return new Promise<{
    socket: ReturnType<typeof io>;
    events: Array<{ type: string; data: any }>;
  }>((resolve) => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: false,
      timeout: 5000,
    });

    const events: Array<{ type: string; data: any }> = [];

    // Evento de conexión
    socket.on('connect', () => {
      const now = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      console.log(`\n[${now}] ✅ [CLIENTE] Conectado al servidor Socket.IO`);
      console.log(`   Socket ID: ${socket.id}`);
    });

    // Suscribirse a room de documento
    socket.on('connect', () => {
      const now = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      console.log(`[${now}] 📡 [CLIENTE] Suscribiéndose a room: document:${TEST_DOCUMENT_ID}`);
      socket.emit('subscribe:document', TEST_DOCUMENT_ID);
    });

    // Suscribirse a room de admins
    socket.on('connect', () => {
      const now = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      console.log(`[${now}] 📡 [CLIENTE] Suscribiéndose a room: admins`);
      socket.emit('subscribe:admins');
    });

    // Escuchar eventos de cambio de estado
    socket.on('document:statusChanged', (data: StatusChangedEvent) => {
      const now = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      console.log(`\n[${now}] 📄 [EVENTO] document:statusChanged recibido:`);
      console.log(`   documentId: ${data.documentId}`);
      console.log(`   status: ${data.status}`);
      console.log(`   reason: ${data.reason || '(sin razón)'}`);
      console.log(`   timestamp: ${data.timestamp}`);
      events.push({ type: 'document:statusChanged', data });
    });

    // Escuchar eventos de incidencias
    socket.on('integration:incident', (data: IncidentEvent) => {
      const now = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      console.log(`\n[${now}] ⚠️ [EVENTO] integration:incident recibido:`);
      console.log(`   type: ${data.type}`);
      console.log(`   details: ${data.details}`);
      console.log(`   documentId: ${data.documentId || '(sin documento)'}`);
      console.log(`   timestamp: ${data.timestamp}`);
      events.push({ type: 'integration:incident', data });
    });

    // Cuando se reciban al menos 2 eventos, resolver la promesa
    const checkEvents = setInterval(() => {
      if (events.length >= 2) {
        clearInterval(checkEvents);
        console.log('\n✅ [CLIENTE] Eventos recibidos:', events.length);
        resolve({ socket, events });
      }
    }, 500);

    // Timeout de 60 segundos para recibir eventos
    setTimeout(() => {
      clearInterval(checkEvents);
      resolve({ socket, events });
    }, 60000);
  });
}

/**
 * Función principal
 */
async function main() {
  const now = new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  CLIENTE DE PRUEBA SOCKET.IO');
  console.log(`  Inicio: ${now}`);
  console.log('═══════════════════════════════════════════════════\n');
  console.log(`🌐 Conectando a: ${SOCKET_URL}`);
  console.log(`📄 Document ID: ${TEST_DOCUMENT_ID}\n`);
  console.log('───────────────────────────────────────────────────');
  console.log('  📌 INSTRUCCIONES:');
  console.log('  1. En otra terminal, ejecuta:');
  console.log(`     .\\scripts\\test-webhook.ps1 ${TEST_DOCUMENT_ID}`);
  console.log('  2. O usa Insomnia con ese documentId');
  console.log('  3. Espera hasta 60 segundos...');
  console.log('───────────────────────────────────────────────────\n');

  try {
    // Paso 1: Conectar cliente
    console.log('── Paso 1: Conectando cliente Socket.IO ──\n');
    const { socket, events } = await createSocketClient();

    // Paso 2: Mostrar eventos recibidos
    console.log('\n── Paso 2: Resumen de eventos recibidos ──\n');
    if (events.length === 0) {
      console.log('⚠️  No se recibieron eventos en el tiempo esperado.');
      console.log('   Esto puede significar que:');
      console.log('   - El servidor no está corriendo');
      console.log('   - No se creó ningún documento (que dispara los eventos)');
      console.log('   - Los eventos se enviaron antes de que el cliente se conectara');
    } else {
      console.log(`✅ Total de eventos recibidos: ${events.length}\n`);
      events.forEach((event, index) => {
        console.log(`  ${index + 1}. ${event.type}`);
        console.log(`     ${JSON.stringify(event.data, null, 2)}`);
      });
    }

    // Paso 3: Cerrar conexión
    console.log('\n── Paso 3: Cerrando conexión ──\n');
    socket.close();
    console.log('👋 Cliente desconectado\n');

    console.log('═══════════════════════════════════════════════════');
    console.log('  PRUEBA COMPLETADA');
    console.log('═══════════════════════════════════════════════════\n');

    // Retorno código según resultados
    process.exit(events.length >= 2 ? 0 : 1);
  } catch (error: any) {
    console.error('\n❌ [ERROR] Falló la conexión:', error.message);
    process.exit(1);
  }
}

// Ejecutar
main();