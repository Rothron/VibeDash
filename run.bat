@echo off
set PORT=%1
if "%PORT%"=="" set PORT=8000

cd /d "%~dp0"
echo Serving Boulder Dash at http://localhost:%PORT%/html/boulder-dash.html
python -m http.server %PORT%
