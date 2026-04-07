#!/usr/bin/env bash
# download-distil-whisper.sh
# 下载 Distil-Whisper large-v3 GGUF 模型到 public/models/
# Download Distil-Whisper large-v3 GGUF model to public/models/
#
# 用法 | Usage:
#   bash scripts/download-distil-whisper.sh
#
# 前置条件 | Prerequisites:
#   - curl
#   - whisper.cpp server >= 1.7.x（GGUF 支持）
#
# 模型来源 | Model source:
#   https://huggingface.co/distil-whisper/distil-large-v3-gguf

set -euo pipefail

MODEL_DIR="${DESTDIR:-public/models}"
MODEL_FILENAME="ggml-distil-whisper-large-v3.bin"
HF_REPO="distil-whisper/distil-large-v3-gguf"
HF_FILE="ggml-distil-large-v3.bin"
HF_URL="https://huggingface.co/${HF_REPO}/resolve/main/${HF_FILE}"
DEST="${MODEL_DIR}/${MODEL_FILENAME}"

mkdir -p "${MODEL_DIR}"

if [ -f "${DEST}" ]; then
  echo "[Distil-Whisper] 模型已存在，跳过下载 | Model already exists, skipping download: ${DEST}"
  exit 0
fi

echo "[Distil-Whisper] 正在下载模型（约 1.5 GB）... | Downloading model (~1.5 GB)..."
echo "  来源 | Source : ${HF_URL}"
echo "  目标 | Target : ${DEST}"
echo ""

curl -L --progress-bar --retry 3 --retry-delay 5 \
  -o "${DEST}" \
  "${HF_URL}"

echo ""
echo "[Distil-Whisper] 下载完成 | Download complete: ${DEST}"
echo "  请确保 whisper-server 以此模型启动 | Pass this model file to whisper-server on startup"
