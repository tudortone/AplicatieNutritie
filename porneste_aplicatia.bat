@echo off
cd /d "%~dp0"

echo ==========================================
echo Pornire aplicatie NutriAI (Backend + Expo Mobile QR)...
echo ==========================================

echo [1/2] Pornim Backend-ul NutriAI (port 3000)...
start "Backend - NutriAI" cmd /k "cd backend-nutritie-ai && npm start"

echo Asteptam pornirea backend-ului (3 secunde)...
ping 127.0.0.1 -n 4 > nul

echo [2/2] Pornim serverul Expo pentru telefon (scaneaza codul QR cu Expo Go)...
start "Frontend Expo QR - NutriAI" cmd /k "cd frontend-nutritie && npm start"

echo ==========================================
echo Ambele servere au fost pornite in ferestre separate!
echo 1. Fereastra Backend ruleaza pe portul 3000.
echo 2. In fereastra Frontend poti scana codul QR direct cu telefonul (aplicatia Expo Go).
echo ==========================================
pause
