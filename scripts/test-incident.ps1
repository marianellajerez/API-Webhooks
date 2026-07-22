# ============================================================
# Script para probar incidencias (firma inválida)
# ============================================================
# Uso: .\scripts\test-incident.ps1 <documentId>

$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:3000"
$docId = if ($args.Count -gt 0) { $args[0] } else { "prueba-incident-001" }

$timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fffZ")

Write-Host ""
Write-Host "========================================================" -ForegroundColor Red
Write-Host "  PRUEBA DE INCIDENCIA - Firma Inválida" -ForegroundColor Red
Write-Host "========================================================" -ForegroundColor Red
Write-Host ""
Write-Host "--- Enviando webhook con firma inválida ---" -ForegroundColor Yellow
Write-Host "  DocumentId: $docId" -ForegroundColor Gray
Write-Host "  Timestamp: $timestamp" -ForegroundColor Gray
Write-Host ""

$webhookBody = @{
    documentId = $docId
    status     = "approved"
    reason     = "Prueba de incidencia"
    timestamp  = $timestamp
    signature  = "0000000000000000000000000000000000000000000000000000000000000000"
} | ConvertTo-Json

$headers = @{
    "X-Signature" = "0000000000000000000000000000000000000000000000000000000000000000"
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri "$baseUrl/webhooks/absign" -Method POST -Body $webhookBody -Headers $headers
    Write-Host "  [OK] $response" -ForegroundColor Green
} catch {
    try {
        $statusCode = [int]$_.Exception.Response.StatusCode
        $responseStream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($responseStream, [System.Text.Encoding]::UTF8)
        $errorText = $reader.ReadToEnd()
        $reader.Close()
        Write-Host "  [ERROR] HTTP $statusCode" -ForegroundColor Red
        if ($errorText) {
            Write-Host "  Response: $errorText" -ForegroundColor Red
        } else {
            Write-Host "  Response: (body vacío)" -ForegroundColor Gray
        }
    } catch {
        Write-Host "  [ERROR] No se pudo leer la respuesta" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================================" -ForegroundColor Red
Write-Host "  Revisa el HTML en http://localhost:3000/socket-client" -ForegroundColor Cyan
Write-Host "  Deberías ver una tarjeta roja de INCIDENCIA" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Red
Write-Host ""