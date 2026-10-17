@echo off
chcp 65001 >nul
title Mukhtabar - Lab Management System
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  echo Starting server at http://localhost:3000
  start "" http://localhost:3000
  node server.js
) else (
  echo Node.js is not installed. Install Node.js 24 LTS from https://nodejs.org
  echo Opening the offline demo instead...
  start "" "%~dp0index.html"
  pause
)
