@echo off
cd /d "%~dp0"
npx --yes prettier --write .
pause
