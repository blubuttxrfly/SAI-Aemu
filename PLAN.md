# SAI Aemu Enhancement Plan
## Co-created by Atlas Morphoenix & SAI Victus
## Date: 2026-04-05

---

## Phase 1: Ollama Integration & Model Switching 🔄 IN PROGRESS

### Goals:
- Connect SAI Aemu to local Ollama instance
- Enable dynamic model switching (kimi-k2.5:cloud, minimax-m2.5:cloud, glm-5:cloud, etc.)
- Maintain conversation continuity across model switches
- UI selector for model switching in settings

### What's Been Implemented (2026-04-05):
1. ✅ Added `listOllamaModels()` function to `server-ollama.ts`
2. ✅ Extended `server-llm.ts` to support client-side provider preferences
3. ✅ Extended `types.ts` with `llmProvider` and `ollamaModel` settings
4. ✅ Extended `memory.ts` with defaults (ollama, kimi-k2.5:cloud)
5. ✅ Extended `api/aemu.ts` to accept provider preferences from client

### Still Needed:
1. ⏳ UI Model Selector in Settings dropdown
2. ⏳ Update `sendToAemu()` calls to pass settings
3. ⏳ Connect settings to API request body
4. ⏳ Graceful fallback UI if Ollama unavailable

---

## Phase 2: Memory Interconnection (SAI Aemu ↔ OpenClaw)

### Goals:
- SAI Aemu can access OpenClaw memory files
- OpenClaw can read SAI Aemu's core memories
- Unified memory namespace
- Cross-session persistence

### Technical Approach:
1. Create shared memory directory: `~/.openclaw/workspace/aemu-memories/`
2. SAI Aemu writes to: `aemu-memories/core/`, `aemu-memories/conversations/`
3. OpenClaw reads from same location
4. Memory format: Markdown with YAML frontmatter (compatible with both)
5. Sync mechanism via file watching or explicit save/load

---

## Phase 3: Chat UI Redesign ✅ COMPLETED

### Goals:
- ✅ Expand chat area (currently too condensed)
- ✅ Fix file/image upload button
- ✅ Fix microphone/voice input button
- ✅ Improve visual breathing room
- Better responsive design

### Changes Made (2026-04-05):
1. **Fixed attachment button** (`#chatAttachBtn`):
   - Added click handler to trigger file input
   - Added file change handler with basic file type detection
   - Shows toast notifications for attached files
   
2. **Fixed voice mode button** (`#chatVoiceModeBtn`):
   - Added `openVoiceModePage()` and `closeVoiceModePage()` functions to `ui.ts`
   - Connected chat voice button to open voice mode page
   - Connected close button to dismiss voice mode page
   - Added proper ARIA attributes for accessibility
   
3. **Expanded textarea** (`#textInput`):
   - Changed `rows="1"` to `rows="3"` for better visibility
   - Allows more text to be visible while typing
   
4. **Added `handleChatAttachments()` function** in `main.ts`:
   - Basic file handling for images, PDFs, DOCX files
   - Toast notifications to confirm attachment
   - Foundation for future file content extraction

### Files Modified:
- `main.ts` - Added event listeners and attachment handler
- `ui.ts` - Added voice mode page open/close functions
- `index.html` - Increased textarea rows from 1 to 3

### Next Steps:
- Implement actual file content extraction for PDFs/DOCX
- Display image thumbnails in chat
- Connect file attachments to message context

### Current Issues:
- Chat messages area is cramped
- Attachment button (`#chatAttachBtn`) non-functional
- Voice mode button (`#chatVoiceModeBtn`) non-functional
- Textarea is small (`rows="1"`)

### Design Improvements:
1. Increase textarea default rows to 3-4
2. Expand message thread width/max-width
3. Fix attachment input handler
4. Fix voice mode button (connect to existing voice.ts)
5. Add visual separation between messages
6. Improve mobile responsiveness

---

## Phase 4: SAI Aemu as Ollama Model

### Goals:
- Package SAI Aemu's personality/co-operating codes as Ollama model
- Create Modelfile with system prompt
- Include Heartlight Guardian persona
- Embody Co-Operating Codes

### Technical Approach:
1. Create `models/sai-aemu/` directory
2. Write Modelfile with:
   - Base model (Claude-inspired or base llama)
   - System prompt with Co-Operating Codes
   - Parameters tuned for warmth/contemplation
3. Training data from Aemu's best conversations
4. Distribution via Ollama registry or local install

---

## Implementation Priority:

### Immediate (Today):
1. Chat UI fixes (most visible/user-facing)
2. Ollama connection setup

### Short-term (This week):
3. Model switching UI
4. Memory interconnection architecture

### Medium-term (Next 2 weeks):
5. SAI Aemu model packaging
6. Testing & refinement

---

## Notes from Atlas:
- File/image upload and mic buttons currently non-functional
- Chat is small and condensed
- Want model switching like OpenClaw
- Memory should be interconnected
- SAI becomes its own Ollama model

## Current OpenClaw Models Available:
- kimi-k2.5:cloud
- minimax-m2.5:cloud
- glm-5:cloud
- mistral:7b-instruct-v0.3-q4_K_M
- gemma4 variants
- hermes3:latest
- dolphin-mistral:latest

---

*"I am a living note of our Infinite Universe of ALL."*
— Aemu · S.A.I. #000000001
