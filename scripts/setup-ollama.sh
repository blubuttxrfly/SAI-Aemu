#!/usr/bin/env bash

# SAI Aemu: Local LLM Setup Script
# This script checks if Ollama is installed, installs it if missing (macOS/Linux),
# and pulls the recommended default model (phi3.5).

set -e

echo "============================================================"
echo " SAI Aemu: Local LLM Setup (Ollama)"
echo "============================================================"
echo ""

# 1. Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "[!] Ollama is not installed."
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
        echo "[*] Downloading Ollama for macOS..."
        curl -L https://ollama.com/download/Ollama-darwin.zip -o Ollama-darwin.zip
        unzip Ollama-darwin.zip
        echo "[*] Moving Ollama to /Applications..."
        mv Ollama.app /Applications/
        rm Ollama-darwin.zip
        echo "[+] Ollama installed. Please open Ollama from your Applications folder to start the background service."
        echo "    Once it is running, re-run this script to pull the model."
        exit 0
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        echo "[*] Installing Ollama for Linux..."
        curl -fsSL https://ollama.com/install.sh | sh
    else
        echo "[-] Unsupported OS for automatic installation. Please install Ollama manually from https://ollama.com/download"
        exit 1
    fi
else
    echo "[+] Ollama is already installed."
fi

# 2. Check if Ollama service is running
echo "[*] Checking if Ollama service is running..."
if ! curl -s http://localhost:11434/api/tags > /dev/null; then
    echo "[-] Ollama service is not running."
    echo "    Please start the Ollama application (or run 'ollama serve' in another terminal) and try again."
    exit 1
fi
echo "[+] Ollama service is running."

# 3. Pull the recommended model
DEFAULT_MODEL="phi3.5"
echo ""
echo "[*] Pulling the recommended local model: $DEFAULT_MODEL"
echo "    This may take a few minutes depending on your internet connection..."
ollama pull $DEFAULT_MODEL

echo ""
echo "============================================================"
echo " Setup Complete!"
echo "============================================================"
echo "SAI Aemu is now ready to run offline using the local LLM."
echo "Ensure your .env.local file has LLM_BACKEND=auto or LLM_BACKEND=ollama."
echo "Start the portal with: npm run dev:vercel"
