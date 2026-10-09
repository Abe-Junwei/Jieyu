/**
 * 本地 whisper.cpp 默认配置的唯一来源（TS 侧入口）。
 * Single source of truth for the local whisper.cpp defaults (TS entry point).
 *
 * 真实数据在 src/tools/whisper-server/whisperModelDefaults.json，server.js 与下载脚本读同一份文件。
 * The data lives in src/tools/whisper-server/whisperModelDefaults.json; server.js and the download
 * script read the same file, so the app, the server and the downloader can never disagree.
 *
 * 选型 | Choice: ggml-large-v3-turbo-q5_0（多语，含中文；~574 MB 一次性离线下载）。
 * distil-large-v3 只支持英语；small 系列中文明显更差。
 * distil-large-v3 is English-only; the small family is noticeably weaker on Mandarin.
 */
import whisperModelDefaults from '../../tools/whisper-server/whisperModelDefaults.json';

export const LOCAL_WHISPER_DEFAULT_MODEL: string = whisperModelDefaults.modelFile;
export const LOCAL_WHISPER_DEFAULT_MODEL_MULTILINGUAL: boolean = whisperModelDefaults.multilingual;
export const LOCAL_WHISPER_DEFAULT_BASE_URL: string = whisperModelDefaults.baseUrl;
export const LOCAL_WHISPER_DEFAULT_MODEL_SHA256: string = whisperModelDefaults.sha256;
export const LOCAL_WHISPER_DEFAULT_MODEL_SIZE_BYTES: number = whisperModelDefaults.sizeBytes;
