# ============================================================
# Script para probar Socket.IO desde PowerShell
# ============================================================
# Uso: Ejecutar este script como un todo (no linea por linea)
#
# Flujo:
#   1. Crea un documento
#   2. Genera firma HMAC con propiedades ordenadas
#   3. Envia webhook al endpoint
# ============================================================

$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:3000"
$secret = "mi_secreto_super_secreto_123"

# Accept document ID as parameter, or generate random
if ($args.Count -gt 0) {
    $docId = $args[0]
} else {
    $randomNum = Get-Random -Minimum 1000 -Maximum 9999
    $docId = "prueba-socket-$randomNum"
    Write-Host "" -NoNewline
    Write-Host "  [INFO] Usando documentId aleatorio: $docId" -ForegroundColor Yellow
    Write-Host "  [INFO] Para usar con socket-client, ejecuta:" -ForegroundColor Yellow
    Write-Host "         npm run socket:test" -ForegroundColor Yellow
    Write-Host "  [INFO] Y luego envía el webhook a este mismo documentId" -ForegroundColor Yellow
}

$now = Get-Date -Format "HH:mm:ss"
Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  PRUEBA SOCKET.IO - PowerShell" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "" -NoNewline
Write-Host "  Ejecución: $now" -ForegroundColor Gray
Write-Host ""

# --- PASO 1: Crear documento ---
$now = Get-Date -Format "HH:mm:ss"
Write-Host "" -NoNewline
Write-Host "[$now] --- Paso 1: Creando documento ---" -ForegroundColor Yellow

$docBody = @{
    documentId    = $docId
    thirdPartyEmail = "test@ejemplo.com"
    fileUrl       = "https://ejemplo.com/f.pdf"
    callbackUrl   = "$baseUrl/webhooks/absign"
} | ConvertTo-Json

try {
    $docResponse = Invoke-RestMethod -Uri "$baseUrl/documents" -Method POST -Body $docBody -ContentType "application/json"
    $now = Get-Date -Format "HH:mm:ss"
    Write-Host "  [$now] [OK] Documento creado: $($docResponse.document.id)" -ForegroundColor Green
} catch {
    if ([int]$_.Exception.Response.StatusCode -eq 409) {
        $now = Get-Date -Format "HH:mm:ss"
        Write-Host "  [$now] [WARN] Documento ya existe (continuar)" -ForegroundColor Yellow
    } else {
        Write-Host "  [ERROR] $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# --- PASO 2: Generar firma HMAC con propiedades ordenadas ---
$now = Get-Date -Format "HH:mm:ss"
Write-Host "" -NoNewline
Write-Host "[$now] --- Paso 2: Generando firma HMAC ---" -ForegroundColor Yellow

$timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ")

# Construir JSON string manualmente para garantizar orden exacto
# JavaScript Object.keys().sort() genera: documentId, reason, status, timestamp
$payloadString = '{"documentId":"' + $docId + '","reason":"' + "Prueba CLI Socket.IO" + '","status":"approved","timestamp":"' + $timestamp + '"}'

Write-Host "  Payload: $payloadString" -ForegroundColor Gray

# Generar HMAC-SHA256
$hmac = [System.Security.Cryptography.HMACSHA256]::new()
$hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($secret)
$hash = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($payloadString))
$signature = [BitConverter]::ToString($hash).Replace("-", "").ToLower()

Write-Host "  Firma: $signature" -ForegroundColor Gray

# --- PASO 3: Enviar webhook ---
$now = Get-Date -Format "HH:mm:ss"
Write-Host "" -NoNewline
Write-Host "[$now] --- Paso 3: Enviando webhook ---" -ForegroundColor Yellow

$webhookBody = @{
    documentId = $docId
    status     = "approved"
    reason     = "Prueba CLI Socket.IO"
    timestamp  = $timestamp
    signature  = $signature
} | ConvertTo-Json

$headers = @{
    "X-Signature" = $signature
    "Content-Type" = "application/json"
}

try {
    $webhookResponse = Invoke-RestMethod -Uri "$baseUrl/webhooks/absign" -Method POST -Body $webhookBody -Headers $headers
    $now = Get-Date -Format "HH:mm:ss"
    Write-Host "  [$now] [OK] Webhook procesado: $($webhookResponse.message)" -ForegroundColor Green
    Write-Host "  [$now] Status: $($webhookResponse.status)" -ForegroundColor Green
    Write-Host "  [$now] DocumentId: $($webhookResponse.documentId)" -ForegroundColor Green
} catch {
    # Mostrar error completo
    $statusCode = [int]$_.Exception.Response.StatusCode
    $statusDescription = $_.Exception.Response.StatusDescription
    $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
    $errorText = $reader.ReadToEnd()
    $reader.Close()
    
    $now = Get-Date -Format "HH:mm:ss"
    Write-Host "  [$now] [ERROR] HTTP $($statusCode): $($statusDescription)" -ForegroundColor Red
    Write-Host "  [$now] Response: $($errorText)" -ForegroundColor Red
}

$now = Get-Date -Format "HH:mm:ss"
Write-Host "" -NoNewline
Write-Host "[$now] ========================================================" -ForegroundColor Cyan
Write-Host "  PRUEBA COMPLETADA" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
