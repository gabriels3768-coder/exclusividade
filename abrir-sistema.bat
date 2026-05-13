@echo off
title Sistema Exclusividade
cd /d "C:\Users\Pc\Documents\Sistema-exclusividade"
start "Servidor Sistema Exclusividade" cmd /k node server.js
timeout /t 3 /nobreak >nul
start "" http://localhost:3000
