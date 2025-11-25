#!/bin/bash

echo "========================================"
echo "  WebTeX - Online LaTeX Editor"
echo "========================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed!"
    echo "Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check LaTeX
if ! command -v pdflatex &> /dev/null && ! command -v xelatex &> /dev/null; then
    echo "[WARNING] LaTeX not found. Please install TeX Live or MiKTeX."
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "[INFO] Installing server dependencies..."
    npm install
fi

if [ ! -d "local-compiler/node_modules" ]; then
    echo "[INFO] Installing local compiler dependencies..."
    cd local-compiler
    npm install
    cd ..
fi

echo ""
echo "[INFO] Starting WebTeX..."

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "[INFO] Shutting down WebTeX..."
    kill $SERVER_PID 2>/dev/null
    kill $COMPILER_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start server
node server/index.js &
SERVER_PID=$!

# Start compiler
cd local-compiler
node index.js &
COMPILER_PID=$!
cd ..

sleep 2

echo ""
echo "========================================"
echo "  WebTeX is running!"
echo ""
echo "  Editor:   http://localhost:3000"
echo "  Home:     http://localhost:3000/home"
echo "  Compiler: http://localhost:8088"
echo "========================================"
echo ""
echo "Press Ctrl+C to stop"

# Open browser (cross-platform)
if command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3000/home
elif command -v open &> /dev/null; then
    open http://localhost:3000/home
fi

# Wait for processes
wait
