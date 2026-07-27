@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo AuraSign ver.2 のローカル開発サーバーを起動しています...
echo ブラウザが自動的に開きます (http://localhost:5173)
start http://localhost:5173/
npx vite
