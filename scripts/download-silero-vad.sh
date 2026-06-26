#!/usr/bin/env bash
# download-silero-vad.sh
# 下载 Silero VAD ONNX 模型到 public/models/
# Download Silero VAD ONNX model to public/models/
#
# 用法 | Usage:
#   bash scripts/download-silero-vad.sh
#
# 前置条件 | Prerequisites:
#   - curl
#
# 模型来源 | Model source:
#   https://github.com/snakers4/silero-vad (MIT)

set -euo pipefail

MODEL_DIR="${DESTDIR:-public/models}"
MODEL_FILENAME="silero_vad.onnx"
SOURCE_URL="https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx"
DEST="${MODEL_DIR}/${MODEL_FILENAME}"

mkdir -p "${MODEL_DIR}"

if [ -f "${DEST}" ]; then
  echo "[Silero-VAD] 模型已存在，跳过下载 | Model already exists, skipping download: ${DEST}"
  exit 0
fi

echo "[Silero-VAD] 正在下载模型（约 2.3 MB）... | Downloading model (~2.3 MB)..."
echo "  来源 | Source : ${SOURCE_URL}"
echo "  目标 | Target : ${DEST}"
echo ""

curl -L --progress-bar --retry 3 --retry-delay 5 \
  -o "${DEST}" \
  "${SOURCE_URL}"

echo ""
echo "[Silero-VAD] 下载完成 | Download complete: ${DEST}"
