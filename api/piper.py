import json
import os
from functools import lru_cache
from http.server import BaseHTTPRequestHandler
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_ID = os.environ.get("PIPER_MODEL", "en_US-reza_ibrahim-medium").strip()
INTERNAL_API_SECRET = (os.environ.get("AEMU_INTERNAL_API_SECRET") or os.environ.get("AEMU_SESSION_SECRET") or "").strip()


def json_error(handler: BaseHTTPRequestHandler, status: int, message: str) -> None:
    body = json.dumps({"error": message}).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type, X-Aemu-Internal-Piper")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def read_text_payload(handler: BaseHTTPRequestHandler) -> str:
    raw_length = handler.headers.get("content-length", "0")

    try:
        content_length = int(raw_length)
    except ValueError as exc:
        raise ValueError("invalid content-length") from exc

    raw_body = handler.rfile.read(content_length) if content_length > 0 else b""

    try:
        body = json.loads(raw_body.decode("utf-8") or "{}")
    except json.JSONDecodeError as exc:
        raise ValueError("invalid json body") from exc

    text = body.get("text", "")
    if not isinstance(text, str) or not text.strip():
        raise ValueError("text required")

    return text.strip()


@lru_cache(maxsize=1)
def load_voice():
    from piper import PiperVoice

    configured_data_dir = os.environ.get("PIPER_DATA_DIR", "").strip()
    data_dir_candidates = []
    if configured_data_dir:
        data_dir_candidates.append(Path(configured_data_dir))
    data_dir_candidates.extend([
        PROJECT_ROOT / "piper-data",
        Path(__file__).resolve().parent / "piper-data",
    ])

    model_path = None
    config_path = None
    for candidate in data_dir_candidates:
        candidate_model = candidate / f"{DEFAULT_MODEL_ID}.onnx"
        candidate_config = candidate / f"{DEFAULT_MODEL_ID}.onnx.json"
        if candidate_model.exists() and candidate_config.exists():
            model_path = candidate_model
            config_path = candidate_config
            break

    if model_path is None or config_path is None:
        checked = ", ".join(str(candidate) for candidate in data_dir_candidates)
        raise FileNotFoundError(
            f"Missing Piper model bundle for {DEFAULT_MODEL_ID}. Checked: {checked}"
        )

    return PiperVoice.load(str(model_path), config_path=str(config_path))


def synthesize_wav_bytes(text: str) -> bytes:
    import io
    import wave

    voice = load_voice()
    wav_buffer = io.BytesIO()
    wrote_audio = False

    with wave.open(wav_buffer, "wb") as wav_file:
        for audio_chunk in voice.synthesize(text):
            if not wrote_audio:
                wav_file.setframerate(audio_chunk.sample_rate)
                wav_file.setsampwidth(audio_chunk.sample_width)
                wav_file.setnchannels(audio_chunk.sample_channels)
                wrote_audio = True

            wav_file.writeframes(audio_chunk.audio_int16_bytes)

    if not wrote_audio:
        raise RuntimeError("Piper did not produce any audio")

    return wav_buffer.getvalue()


class handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args) -> None:
        return

    def do_OPTIONS(self) -> None:
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Aemu-Internal-Piper")
        self.end_headers()

    def do_POST(self) -> None:
        if not INTERNAL_API_SECRET or self.headers.get("x-aemu-internal-piper", "") != INTERNAL_API_SECRET:
            json_error(self, 401, "internal authorization required")
            return

        try:
            text = read_text_payload(self)
            audio = synthesize_wav_bytes(text)
        except ValueError as exc:
            json_error(self, 400, str(exc))
            return
        except Exception as exc:
            json_error(self, 500, str(exc))
            return

        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Aemu-Internal-Piper")
        self.send_header("Content-Length", str(len(audio)))
        self.end_headers()
        self.wfile.write(audio)
