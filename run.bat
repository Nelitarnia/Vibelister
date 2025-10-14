@echo off
REM --- Change to the folder this .bat is in ---
cd /d "%~dp0"

REM --- Start a local server on port 8000 ---
start "" python -m http.server 8000

REM --- Give the server a moment to start ---
timeout /t 2 >nul

REM --- Open the page in your default browser ---
start "" http://localhost:8000/index.html