# Reza Ibrahim Voice Setup

This project is already pointed at the Piper voice model `en_US-reza_ibrahim-medium`.

## What the voice path uses

- Browser playback requests `POST /api/speak`
- `api/speak.ts` prefers local Piper when `.venv-piper/bin/python3` and `piper-data/*` are present
- On Vercel, `api/speak.ts` can fall back to the Python function `api/piper.py`

## Required local files

- `piper-data/en_US-reza_ibrahim-medium.onnx`
- `piper-data/en_US-reza_ibrahim-medium.onnx.json`
- `api/piper-data/en_US-reza_ibrahim-medium.onnx`
- `api/piper-data/en_US-reza_ibrahim-medium.onnx.json`
- `.venv-piper/` with `piper-tts==1.4.1`

## Required environment

- `AEMU_SESSION_SECRET`
- `AEMU_ADMIN_SETUP_KEY`
- `AEMU_PASSWORD_PEPPER`
- `PIPER_MODEL=en_US-reza_ibrahim-medium`

Optional:

- `AEMU_INTERNAL_API_SECRET`
- `PIPER_PYTHON_PATH`
- `PIPER_DATA_DIR`
- `PIPER_HTTP_URL`

## Local development

Use Vercel dev instead of plain Vite so the `/api/*` routes exist:

```bash
npm run dev:vercel
```

If you need frontend-only work without the API routes:

```bash
npm run dev
```

## Quick local verification

1. Start the app with `npm run dev:vercel`
2. Unlock the app through the password gate
3. Send a message that should trigger spoken output
4. Confirm `POST /api/speak` returns audio and playback begins

If synthesis fails locally, check:

- `.venv-piper/bin/python3` exists
- the `piper` package imports in that venv
- the two `piper-data` model files exist
- `AEMU_SESSION_SECRET` is set

## Vercel deployment notes

- `vercel.json` includes both `piper-data/**` and `api/piper-data/**` for `api/piper.py`
- keep `PIPER_MODEL=en_US-reza_ibrahim-medium` in project env vars
- `api/piper.py` requires `AEMU_INTERNAL_API_SECRET` or `AEMU_SESSION_SECRET`
- the Python function now checks both the repo-root `piper-data/` folder and the function-local `api/piper-data/` bundle

## Current voice note

The active speech route is now Piper-only. If voice fails, the error should point back to the Piper runtime or model files instead of silently switching to a different provider or voice.
