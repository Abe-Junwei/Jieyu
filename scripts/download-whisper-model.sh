#!/usr/bin/env bash
# download-whisper-model.sh
# 下载本地 whisper.cpp 默认模型（来源与校验值取自 src/tools/whisper-server/whisperModelDefaults.json）
# Download the default local whisper.cpp model (source + checksum from
# src/tools/whisper-server/whisperModelDefaults.json, the single source of truth).
#
# 用法 | Usage:
#   bash scripts/download-whisper-model.sh          # -> ~/.whisper-models/<modelFile>
#   DESTDIR=/some/dir bash scripts/download-whisper-model.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULTS="${ROOT}/src/tools/whisper-server/whisperModelDefaults.json"
read_field() { node -e "process.stdout.write(String(require(process.argv[1])[process.argv[2]]))" "${DEFAULTS}" "$1"; }

MODEL_FILE="$(read_field modelFile)"
SOURCE_URL="$(read_field sourceUrl)"
EXPECTED_SHA256="$(read_field sha256)"
EXPECTED_BYTES="$(read_field sizeBytes)"
MODEL_DIR="${DESTDIR:-${HOME}/.whisper-models}"
DEST="${MODEL_DIR}/${MODEL_FILE}"

sha256_of() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'; else shasum -a 256 "$1" | awk '{print $1}'; fi; }

mkdir -p "${MODEL_DIR}"
if [ -f "${DEST}" ]; then
  if [ "$(sha256_of "${DEST}")" = "${EXPECTED_SHA256}" ]; then
    echo "[whisper-model] already present and verified: ${DEST}"
    exit 0
  fi
  # 先删掉坏文件，重新下载失败时也不会留下可被加载的模型（不留 ~574 MB 隔离副本）| Delete first so a failed re-download leaves no loadable model (no ~574 MB quarantine copy)
  rm -f "${DEST}"
  echo "[whisper-model] existing file has a different sha256; removed, re-downloading" >&2
fi

TMP="$(mktemp "${MODEL_DIR}/.${MODEL_FILE}.XXXXXX")"
trap 'rm -f "${TMP}"' EXIT
echo "[whisper-model] downloading ${MODEL_FILE} (${EXPECTED_BYTES} bytes) from ${SOURCE_URL}"
if ! curl -L --fail --progress-bar --retry 3 --retry-delay 5 -o "${TMP}" "${SOURCE_URL}"; then
  echo "[whisper-model] download failed, no model written (${DEST} absent)" >&2
  exit 1
fi

ACTUAL_BYTES="$(wc -c < "${TMP}" | tr -d ' ')"
ACTUAL_SHA256="$(sha256_of "${TMP}")"
if [ "${ACTUAL_BYTES}" != "${EXPECTED_BYTES}" ] || [ "${ACTUAL_SHA256}" != "${EXPECTED_SHA256}" ]; then
  echo "[whisper-model] checksum mismatch: got ${ACTUAL_BYTES} bytes sha256 ${ACTUAL_SHA256}, expected ${EXPECTED_BYTES} / ${EXPECTED_SHA256}" >&2
  exit 1
fi
mv "${TMP}" "${DEST}"
trap - EXIT
chmod 644 "${DEST}"
echo "[whisper-model] verified and saved: ${DEST}"
