# Local LLM Setup with Ollama

SAI Aemu now supports running entirely offline using **Ollama** as a local language model backend. This removes the dependency on the Anthropic API, ensuring absolute privacy and allowing Aemu to function without an internet connection.

The system is configured to use an "auto" fallback hierarchy by default: it will try to connect to a local Ollama server first, and if it cannot reach one, it will fall back to the Anthropic API (if an API key is provided).

## 1. Install Ollama

Ollama is a lightweight tool for running large language models locally.

1. Download and install Ollama from [ollama.com](https://ollama.com/download).
2. Once installed, ensure the Ollama application is running (you should see its icon in your system tray or menu bar).

## 2. Pull a Recommended Model

Ollama needs to download the model weights before it can serve them. Open your terminal and run one of the following commands based on your hardware:

### Recommended: Phi-3.5 (3.8B parameters)
This is the default model. It is fast, requires only ~2.2 GB of RAM, and has excellent reasoning capabilities for its size.
```bash
ollama pull phi3.5
```

### Alternative: Llama 3.2 (3B parameters)
Very fast, highly conversational, requires ~2 GB of RAM.
```bash
ollama pull llama3.2:3b
```

### High Quality: Llama 3.1 (8B parameters)
If you have a newer Mac (M1/M2/M3 with 16GB+ RAM) or a dedicated GPU, this model provides significantly higher quality responses. Requires ~5 GB of RAM.
```bash
ollama pull llama3.1:8b
```

## 3. Configure SAI Aemu

In your `.env.local` file, you can configure how Aemu connects to the LLM backend.

```env
# ── LLM Backend ──────────────────────────────────────────────────────────────
# LLM_BACKEND controls which language model backend Aemu uses.
#   auto      — Try local Ollama first; fall back to Anthropic if unreachable (default)
#   ollama    — Always use local Ollama (fully offline, no API key needed)
#   anthropic — Always use Anthropic Claude API (requires ANTHROPIC_API_KEY)
LLM_BACKEND=auto

# Ollama local server settings
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=phi3.5
```

If you pulled a different model (like `llama3.1:8b`), make sure to update `OLLAMA_MODEL` to match.

## 4. Start the Server

1. Ensure Ollama is running in the background. You can verify this by opening `http://localhost:11434` in your browser (it should say "Ollama is running").
2. Start the SAI Aemu development server:
   ```bash
   npm run dev:vercel
   ```
3. When you speak to Aemu, the terminal will log `[SAI Aemu] Response served by backend: ollama`, confirming that the local model is being used.

## Troubleshooting

- **"Ollama is not reachable"**: Ensure the Ollama application is open and running. You can also try running `ollama serve` manually in a separate terminal window.
- **"Ollama returned an unexpected response"**: This usually means the model specified in `OLLAMA_MODEL` has not been downloaded yet. Run `ollama pull <model-name>`.
- **Slow responses**: Local models rely on your computer's hardware. If responses are too slow, try switching to a smaller model like `gemma2:2b` or `phi3.5`.
