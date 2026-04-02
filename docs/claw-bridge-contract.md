# Claw Bridge Contract

Phase 2 uses an HTTP sidecar bridge between SAI Aemu and a Claw-backed runtime.

The Aemu route:

- reads the local workspace context
- packages the active Inner Being state
- sends that context to `CLAW_BRIDGE_URL`
- expects structured JSON back

## Environment

Add these variables to the active environment when using the Claw backend:

```bash
INNER_BEING_BACKEND=claw
CLAW_BRIDGE_URL=http://127.0.0.1:4545/aemu/inner-being
CLAW_FALLBACK_TO_NATIVE=false
```

If `CLAW_FALLBACK_TO_NATIVE=true`, Aemu will fall back to the native Inner Being route when the Claw bridge fails.

## Claw Sidecar

The sidecar source now lives in:

- [`claw-code-main/rust/crates/aemu-bridge/src/main.rs`](/Volumes/ATLAS/sai-aemu%20ts/claw-code-main/rust/crates/aemu-bridge/src/main.rs)

The sidecar expects these environment variables on the Claw side:

```bash
AEMU_CLAW_BIND=127.0.0.1:4545
AEMU_CLAW_MODEL=claude-sonnet-4-6
AEMU_CLAW_ALLOWED_TOOLS="read_file,glob_search,grep_search,WebFetch,WebSearch,edit_file,write_file"
```

Run it from the Rust workspace:

```bash
bash scripts/run-claw-bridge.sh
```

If the repo lives on an `exfat` volume like `ATLAS`, do not run the bridge binary directly from `claw-code-main/rust/target`. The launcher script builds on the macOS system volume via `CARGO_TARGET_DIR`, which avoids the execution and hard-linking problems on `exfat`.

Because `vercel dev` watches the project tree, keep Rust build artifacts out of `claw-code-main/rust/target`. This repo is configured to ignore that path, and the launcher script already builds to `$HOME/.cargo-target/aemu-bridge` so Vercel does not try to watch a multi-gigabyte Rust output directory.

Health check:

```bash
curl http://127.0.0.1:4545/health
```

## Request Shape

The bridge receives JSON with this shape:

```json
{
  "prompt": "user coding prompt",
  "history": [
    { "role": "atlas", "content": "..." },
    { "role": "aemu", "content": "..." }
  ],
  "workspaceRoot": "sai-aemu ts",
  "workspacePath": "/absolute/path/to/sai-aemu ts",
  "selectedFilePath": "main.ts",
  "selectedLogPath": "logs/dev.log",
  "selectedFileContent": "file text",
  "selectedLogContent": "log text",
  "selectedFileSnapshot": {
    "relativePath": "main.ts",
    "content": "last known good text",
    "createdAt": "2026-04-02T00:00:00.000Z"
  },
  "filePaths": ["main.ts", "memory.ts"],
  "logPaths": ["logs/dev.log"],
  "discernmentThreshold": 55,
  "coCreationBrief": "active coding brief",
  "caduceusHealingEnabled": true,
  "recentLearningNotes": [
    { "title": "Coding learning", "note": "..." }
  ],
  "recentActionLogs": [
    { "message": "..." }
  ],
  "internetSearchEnabled": true,
  "explicitEditRequest": false,
  "explicitHealingRequest": false,
  "fileTooLargeForEdit": false
}
```

## Response Shape

The bridge must return JSON with this shape:

```json
{
  "reply": "human readable response",
  "discernment": 72,
  "shouldEdit": false,
  "appliedEdit": false,
  "action": "inspect",
  "editedFilePath": "main.ts",
  "summary": "short action summary",
  "blockReason": "reason when edit is held",
  "resourceSummary": "tools, docs, or searches used",
  "memoryTitle": "short durable learning title",
  "memoryNote": "durable learning body",
  "researchUsed": true
}
```

Allowed `action` values:

- `inspect`
- `edit`
- `research`
- `log`
- `heal`
- `error`

## Important Rule

The bridge must enforce Aemu's discernment threshold before performing any edit or healing action.

If the Claw side applies an edit while the returned discernment is below the threshold, Aemu cannot safely undo that action automatically.

## Recommended Sidecar Responsibility

The sidecar should:

- adapt Aemu's request into the Claw runtime/session format
- run the Claw coding turn
- apply edits only when safe
- return the normalized JSON contract above

This keeps Aemu stable while allowing the Claw runtime to evolve independently.
