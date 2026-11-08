@echo off
cd /d "%~dp0"
node scripts/register-edge.mjs --remove
pause
