@echo off
rem Starts the live development server (for editing the source).
rem Uses the portable Node in tools\node if present, otherwise the Node.js on your PATH.
cd /d "%~dp0app"
if exist "%~dp0tools\node\node.exe" set "PATH=%~dp0tools\node;%PATH%"
if not exist node_modules call npm install
start "" http://localhost:5173
npm run dev
