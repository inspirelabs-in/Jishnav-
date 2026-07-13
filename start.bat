@echo off
echo Starting GrabGPT...

REM Add Ollama to PATH (needed for Ollama CLI if used)
set "PATH=%PATH%;C:\Users\Jishnav\AppData\Local\Programs\Ollama"

REM Start backend in a new terminal window
start "GrabGPT Backend" cmd /k "set PATH=%PATH%;C:\Users\Jishnav\AppData\Local\Programs\Ollama && cd /d %~dp0backend && python main.py"

REM Wait 3 seconds for backend to initialize
timeout /t 3 /nobreak >nul

REM Start frontend in a new terminal window
start "GrabGPT Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

REM Wait 3 seconds for frontend to start
timeout /t 3 /nobreak >nul

REM Open browser
start http://localhost:5173

echo Done! Two terminal windows opened.
echo Close them to stop GrabGPT.
