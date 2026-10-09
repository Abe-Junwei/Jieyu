#!/usr/bin/env bash
# download-silero-vad.sh
# 下载钉死版本的 Silero VAD ONNX 模型到 public/models/，并校验 sha256
# Download the pinned Silero VAD ONNX model to public/models/ and verify its sha256
#
# 用法 | Usage:
#   bash scripts/download-silero-vad.sh
#
# 前置条件 | Prerequisites:
#   - curl
#   - sha256sum 或 shasum | sha256sum or shasum
#
# 模型来源 | Model source:
#   https://github.com/snakers4/silero-vad (MIT), tag v6.2.3 (commit 5cd79456)
#   sha256 与 PyPI silero-vad 6.2.3 wheel 内 silero_vad/data/silero_vad.onnx 一致
#   sha256 matches silero_vad/data/silero_vad.onnx inside the PyPI silero-vad 6.2.3 wheel
#   升级时同时改 VERSION 和 SHA256 | Bump VERSION and SHA256 together

set -euo pipefail

SILERO_VERSION="v6.2.3"
EXPECTED_SHA256="1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3"
EXPECTED_BYTES=2327524

MODEL_DIR="${DESTDIR:-public/models}"
MODEL_FILENAME="silero_vad.onnx"
SOURCE_URL="https://github.com/snakers4/silero-vad/raw/${SILERO_VERSION}/src/silero_vad/data/silero_vad.onnx"
DEST="${MODEL_DIR}/${MODEL_FILENAME}"

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

mkdir -p "${MODEL_DIR}"

if [ -f "${DEST}" ]; then
  ACTUAL="$(sha256_of "${DEST}")"
  if [ "${ACTUAL}" = "${EXPECTED_SHA256}" ]; then
    echo "[Silero-VAD] 模型已存在且校验通过（${SILERO_VERSION}）| Model present and verified (${SILERO_VERSION}): ${DEST}"
    exit 0
  fi
  echo "[Silero-VAD] 现有模型 sha256 不符，重新下载 | Existing model sha256 mismatch, re-downloading" >&2
  echo "  expected: ${EXPECTED_SHA256}" >&2
  echo "  actual  : ${ACTUAL}" >&2
fi

TMP="$(mktemp "${MODEL_DIR}/.silero_vad.XXXXXX")"
trap 'rm -f "${TMP}"' EXIT

echo "[Silero-VAD] 正在下载 ${SILERO_VERSION}（约 2.3 MB）... | Downloading ${SILERO_VERSION} (~2.3 MB)..."
echo "  来源 | Source : ${SOURCE_URL}"
echo "  目标 | Target : ${DEST}"
echo ""

curl -fL --progress-bar --retry 3 --retry-delay 5 \
  -o "${TMP}" \
  "${SOURCE_URL}"

ACTUAL="$(sha256_of "${TMP}")"
if [ "${ACTUAL}" != "${EXPECTED_SHA256}" ]; then
  echo "[Silero-VAD] sha256 校验失败，未写入模型 | sha256 verification failed, model not written" >&2
  echo "  expected: ${EXPECTED_SHA256}" >&2
  echo "  actual  : ${ACTUAL}" >&2
  exit 1
fi
ACTUAL_BYTES="$(wc -c < "${TMP}" | tr -d ' ')"
if [ "${ACTUAL_BYTES}" != "${EXPECTED_BYTES}" ]; then
  echo "[Silero-VAD] 文件大小不符 | size mismatch: ${ACTUAL_BYTES} != ${EXPECTED_BYTES}" >&2
  exit 1
fi

mv -f "${TMP}" "${DEST}"
chmod 644 "${DEST}"
trap - EXIT

echo ""
echo "[Silero-VAD] 下载并校验完成 | Downloaded and verified: ${DEST} (${SILERO_VERSION}, sha256 ${EXPECTED_SHA256})"
