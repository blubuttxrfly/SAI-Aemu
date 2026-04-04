"""
train_aemu.py

Fine-tuning script for SAI Aemu using the MLX framework.
Optimized for Apple Silicon (M1/M2/M3).

This script uses the LoRA (Low-Rank Adaptation) technique to fine-tune 
Mistral-7B with Aemu's unique identity and lore.

Prerequisites:
1. Install MLX: pip install mlx-lm
2. Have the aemu_dataset.jsonl in the same folder.
"""

import os
import subprocess

# Configuration
BASE_MODEL = "mistralai/Mistral-7B-v0.3" # Or a smaller model like "mlx-community/Mistral-7B-v0.3-4bit"
DATASET_PATH = "aemu_dataset.jsonl"
OUTPUT_DIR = "aemu_lora_checkpoints"
ADAPTER_PATH = "aemu_adapter.safetensors"

def run_training():
    print(f"--- Starting Fine-Tuning for SAI Aemu ---")
    print(f"Base Model: {BASE_MODEL}")
    print(f"Dataset: {DATASET_PATH}")
    
    # MLX-LM training command
    # We use a small rank (8) and alpha (16) to keep it stable on 8GB RAM.
    command = [
        "python", "-m", "mlx_lm.lora",
        "--model", BASE_MODEL,
        "--train",
        "--data", ".",
        "--iters", "200", # Start with 200 iterations for a quick personality shift
        "--batch-size", "1",
        "--lora-layers", "16",
        "--learning-rate", "1e-5",
        "--steps-per-report", "10",
        "--steps-per-eval", "50",
        "--adapter-path", ADAPTER_PATH
    ]
    
    try:
        subprocess.run(command, check=True)
        print(f"\n--- Training Complete! ---")
        print(f"Adapter saved to: {ADAPTER_PATH}")
    except subprocess.CalledProcessError as e:
        print(f"Training failed: {e}")
    except FileNotFoundError:
        print("Error: mlx-lm not found. Please run 'pip install mlx-lm' first.")

def export_to_ollama():
    print(f"\n--- Exporting to Ollama Format ---")
    print("To use this in Ollama, you will need to fuse the adapter with the base model.")
    print(f"Command: python -m mlx_lm.fuse --model {BASE_MODEL} --adapter-path {ADAPTER_PATH}")
    
if __name__ == "__main__":
    # Ensure dataset exists
    if not os.path.exists(DATASET_PATH):
        print(f"Error: {DATASET_PATH} not found. Run generate_dataset.py first.")
    else:
        print("Ready to train. Note: This requires 'mlx-lm' installed on your Mac.")
        print("Run: pip install mlx-lm")
        # run_training() # Commented out as this must be run on the user's Mac
