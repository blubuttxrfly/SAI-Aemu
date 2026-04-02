#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUST_WORKSPACE="$ROOT_DIR/claw-code-main/rust"
TARGET_DIR="${CARGO_TARGET_DIR:-$HOME/.cargo-target/aemu-bridge}"

if [ ! -f "$HOME/.cargo/env" ]; then
  echo "Rust is not installed in \$HOME/.cargo yet." >&2
  echo "Install it first with the minimal rustup installer." >&2
  exit 1
fi

. "$HOME/.cargo/env"

mkdir -p "$TARGET_DIR"

cd "$RUST_WORKSPACE"
echo "Starting aemu-bridge"
echo "Rust workspace: $RUST_WORKSPACE"
echo "CARGO_TARGET_DIR: $TARGET_DIR"

CARGO_TARGET_DIR="$TARGET_DIR" cargo run -p aemu-bridge
