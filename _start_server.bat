@echo off

:starter
echo Starting Sanic Server (Native)...
REM py server.py

set PYTHONWARNINGS=ignore::DeprecationWarning
python -W ignore::DeprecationWarning server.py

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Server failed to start.
)
goto starter
