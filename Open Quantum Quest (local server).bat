@echo off
rem Fallback launcher: serves Quantum Quest from a tiny local web server (needs Python).
rem Use this only if double-clicking QuantumQuest.html does not work in your browser.
cd /d "%~dp0"
start "" http://localhost:8765/QuantumQuest.html
python -m http.server 8765 --bind 127.0.0.1
