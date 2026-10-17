@echo off
rem Ativa o PIX automatico do delivery com o Mercado Pago (duplo clique)
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ativar-pix-mercadopago.ps1"
echo.
pause
