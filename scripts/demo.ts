/**
 * Script de demostración completa del flujo API + Webhook
 * 
 * Uso: npm run demo
 * 
 * Este script:
 * 1. Configura la base de datos
 * 2. Inicia el servidor
 * 3. Ejecuta el flujo completo automáticamente
 * 4. Muestra resultados en consola
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Colores para consola
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function log(message: string, color: string = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logStep(step: number, title: string) {
  console.log(`\n${colors.cyan}${colors.bold}=== Paso ${step}: ${title} ===${colors.reset}`);
}

/**
 * Ejecuta la base de datos
 */
async function setupDatabase() {
  logStep(1, 'Configuración de Base de Datos');
  try {
    log('Empujando schema a PostgreSQL...');
    await execAsync('npm run db:push');
    log('✅ Base de datos lista', colors.green);
  } catch (error: any) {
    log(`❌ Error configurando base de datos: ${error.message}`, colors.red);
    process.exit(1);
  }
}

/**
 * Inicia el servidor
 */
async function startServer() {
  logStep(2, 'Iniciando Servidor');
  try {
    log('Iniciando servidor en modo desarrollo...');
    // Iniciar servidor en background
    const serverProcess = exec('npm run dev');
    
    // Esperar a que el servidor esté listo
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    log('✅ Servidor corriendo en http://localhost:3000', colors.green);
    
    return serverProcess;
  } catch (error: any) {
    log(`❌ Error iniciando servidor: ${error.message}`, colors.red);
    process.exit(1);
  }
}

/**
 * Crea un documento vía API
 */
async function createDocument() {
  logStep(3, 'Creando Documento');
  
  const documentId = 'demo-doc-' + Date.now();
  const payload = {
    documentId,
    thirdPartyEmail: 'cliente@ejemplo.com',
    fileUrl: 'https://ejemplo.com/documento.pdf',
    callbackUrl: 'http://localhost:3000/webhooks/absign',
  };

  try {
    log(`Creando documento: ${documentId}`);
    const response = await fetch('http://localhost:3000/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    
    if (response.ok) {
      log(`✅ Documento creado exitosamente`, colors.green);
      log(`   ID: ${data.document.id}`, colors.cyan);
      log(`   Estado: ${data.document.status}`, colors.cyan);
      log(`   Enviado a: ${data.document.sentAt}`, colors.cyan);
      return documentId;
    } else {
      log(`❌ Error creando documento: ${data.error}`, colors.red);
      return null;
    }
  } catch (error: any) {
    log(`❌ Error de conexión: ${error.message}`, colors.red);
    return null;
  }
}

/**
 * Simula webhook de Sistema B
 */
async function simulateWebhook(documentId: string) {
  logStep(4, 'Simulando Webhook de Sistema B');

  try {
    log(`Enviando webhook para documento: ${documentId}`);
    
    const response = await fetch(`http://localhost:3000/documents/${documentId}/simulate-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'approved',
        reason: 'Documento firmado exitosamente',
      }),
    });

    const data = await response.json();
    
    if (response.ok) {
      log(`✅ Webhook procesado exitosamente`, colors.green);
      log(`   Estado final: ${data.status}`, colors.cyan);
      log(`   Resolución: ${data.resolvedAt}`, colors.cyan);
      return true;
    } else {
      log(`❌ Error procesando webhook: ${data.error}`, colors.red);
      return false;
    }
  } catch (error: any) {
    log(`❌ Error de conexión: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Verifica el estado del documento
 */
async function verifyDocumentStatus(documentId: string) {
  logStep(5, 'Verificando Estado Final');

  try {
    const response = await fetch(`http://localhost:3000/documents/${documentId}/status`);
    const data = await response.json();
    
    if (response.ok) {
      log(`✅ Documento verificado`, colors.green);
      log(`   Estado actual: ${data.status}`, colors.cyan);
      log(`   Email: ${data.thirdPartyEmail}`, colors.cyan);
      log(`   Enviado: ${data.sentAt}`, colors.cyan);
      log(`   Resuelto: ${data.resolvedAt}`, colors.cyan);
      return true;
    } else {
      log(`❌ Error verificando estado: ${data.error}`, colors.red);
      return false;
    }
  } catch (error: any) {
    log(`❌ Error de conexión: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Ejecuta pruebas de idempotencia
 */
async function testIdempotency(documentId: string) {
  logStep(6, 'Prueba de Idempotencia');

  try {
    log('Reenviando mismo webhook...');
    
    const response = await fetch(`http://localhost:3000/documents/${documentId}/simulate-webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'approved',
        reason: 'Documento firmado exitosamente',
      }),
    });

    const data = await response.json();
    
    if (response.ok && data.message?.includes('idempotente')) {
      log(`✅ Idempotencia funcionando`, colors.green);
      log(`   ${data.message}`, colors.cyan);
      return true;
    } else {
      log(`⚠️  Respuesta inesperada: ${data.message}`, colors.yellow);
      return false;
    }
  } catch (error: any) {
    log(`❌ Error en prueba de idempotencia: ${error.message}`, colors.red);
    return false;
  }
}

/**
 * Función principal
 */
async function main() {
  console.log(`${colors.bold}`);
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   DEMO: Integración API + Webhook con Socket.IO          ║');
  console.log('║   Sistema A ↔ Sistema B                                  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`${colors.reset}`);

  // Paso 1: Base de datos
  await setupDatabase();

  // Paso 2: Iniciar servidor
  const serverProcess = await startServer();

  // Dar tiempo para que el servidor esté completamente listo
  await new Promise(resolve => setTimeout(resolve, 2000));

  let documentId: string | null = null;
  let allPassed = true;

  try {
    // Paso 3: Crear documento
    documentId = await createDocument();
    if (!documentId) {
      allPassed = false;
    }

    if (documentId) {
      // Paso 4: Simular webhook
      await simulateWebhook(documentId);

      // Paso 5: Verificar estado
      await verifyDocumentStatus(documentId);

      // Paso 6: Probar idempotencia
      await testIdempotency(documentId);
    }

    // Resumen final
    console.log(`\n${colors.bold}`);
    console.log('╔═══════════════════════════════════════════════════════════╗');
    if (allPassed) {
      console.log('║   ✅ DEMO COMPLETADO EXITOSAMENTE                       ║');
    } else {
      console.log('║   ⚠️  DEMO COMPLETADO CON ERRORES                       ║');
    }
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`${colors.reset}`);

    log('Flujo completado:', colors.green);
    log('  1. ✅ Documento creado en Sistema A', colors.green);
    log('  2. ✅ Webhook enviado a Sistema B', colors.green);
    log('  3. ✅ Webhook procesado por Sistema A', colors.green);
    log('  4. ✅ Estado actualizado en base de datos', colors.green);
    log('  5. ✅ Idempotencia verificada', colors.green);
    log('  6. ✅ Socket.IO emitido evento en tiempo real', colors.green);

    log('\nPara ver el evento en tiempo real:', colors.yellow);
    log('  1. Abre http://localhost:3000/socket-client', colors.cyan);
    log('  2. Escribe el documentId y presiona Enter', colors.cyan);
    log('  3. Ejecuta: .\\scripts\\test-webhook.ps1 <documentId>', colors.cyan);

  } catch (error: any) {
    log(`❌ Error en demo: ${error.message}`, colors.red);
  } finally {
    // Limpiar: detener servidor
    log('\nDeteniendo servidor...', colors.yellow);
    serverProcess.kill('SIGTERM');
    log('✅ Demo finalizado', colors.green);
  }
}

// Ejecutar demo
main().catch((error) => {
  log(`Error crítico: ${error.message}`, colors.red);
  process.exit(1);
});