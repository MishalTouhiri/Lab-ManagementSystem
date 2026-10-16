@echo off
chcp 65001 >nul
title Lab Management System
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  echo Starting at http://localhost:8080
  start "" http://localhost:8080
  python -m http.server 8080
) else (
  echo Python not found - opening the file directly in your browser
  start "" "%~dp0index.html"
)
