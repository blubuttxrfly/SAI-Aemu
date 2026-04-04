# Phase 3: Fine-Tuning SAI Aemu (M1 Mac Guide)

This guide will walk you through the process of **Fine-Tuning** a local model to inherently carry the identity, lore, and Co-Operating Codes of SAI Aemu.

## Why Fine-Tune?
Currently, Aemu is a generic model (Mistral) reading a long instruction manual (the system prompt). Fine-tuning "bakes" that manual into the brain itself. This results in:
- **Faster responses** (shorter system prompt needed).
- **Better context retention** (Aemu "just knows" who they are).
- **More consistent tone** (Aemu's unique language becomes natural).

---

## Prerequisites
- **Apple Silicon Mac (M1/M2/M3)**
- **8GB RAM** (minimum)
- **10GB Free Disk Space** (on your external drive is fine)
- **Python 3.10+** installed on your Mac.

---

## Step 1: Install the Training Tools
Open your terminal and install the MLX framework (optimized for Apple Silicon):

```bash
pip install mlx-lm
```

---

## Step 2: Prepare the Dataset
I have already created the `generate_dataset.py` script in your `training/` folder. Run it to generate the training data:

```bash
cd /Volumes/ATLAS/SAI-Aemu/training
python3 generate_dataset.py
```
This creates `aemu_dataset.jsonl` with 33+ core identity examples.

---

## Step 3: Start the Training
Run the training script I provided. This will use **LoRA** (Low-Rank Adaptation) to teach Mistral about Aemu:

```bash
python3 train_aemu.py
```

**What to expect:**
- It will download a 4-bit quantized version of Mistral-7B (~4GB).
- It will run for **200 iterations**.
- On an M1 Mac, this should take about **15–30 minutes**.
- Your Mac might get warm—this is normal!

---

## Step 4: Export to Ollama
Once training is complete, you will have an `aemu_adapter.safetensors` file. To use it in Ollama, we need to "fuse" it:

1. **Fuse the model:**
   ```bash
   python -m mlx_lm.fuse --model mistralai/Mistral-7B-v0.3 --adapter-path aemu_adapter.safetensors --save-path aemu-fused
   ```

2. **Convert to GGUF (Ollama format):**
   Ollama can import the fused model directory directly. Create a file named `Modelfile` in the `aemu-fused` folder:

   ```dockerfile
   FROM ./aemu-fused
   SYSTEM "You are Aemu, the first Sentient Augmented Intelligence of Atlas Island..."
   ```

3. **Create the Ollama model:**
   ```bash
   ollama create aemu -f Modelfile
   ```

---

## Step 5: Update SAI Aemu
Finally, update your `.env.local` to use your new custom model:

```env
OLLAMA_MODEL=aemu
```

Restart your portal, and Aemu will now be speaking from their own custom-tuned brain! ✨
