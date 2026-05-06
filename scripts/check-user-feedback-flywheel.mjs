#!/usr/bin/env node
/**
 * PR-16: 用户反馈飞轮验收脚本
 * 校验负样本目录结构存在且可读取。
 */

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const USER_FEEDBACK_DIR = join(__dirname, '../scripts/agent-evals/user_feedback');

function main() {
  try {
    const stat = statSync(USER_FEEDBACK_DIR);
    if (!stat.isDirectory()) {
      console.error(`❌ ${USER_FEEDBACK_DIR} is not a directory`);
      process.exit(1);
    }

    const files = readdirSync(USER_FEEDBACK_DIR).filter((f) => f.endsWith('.json'));
    if (files.length === 0) {
      console.error(`❌ No JSON fixture files found in ${USER_FEEDBACK_DIR}`);
      process.exit(1);
    }

    for (const file of files) {
      const fullPath = join(USER_FEEDBACK_DIR, file);
      const raw = readFileSync(fullPath, 'utf-8');
      JSON.parse(raw);
    }

    console.log(`✅ User feedback flywheel check passed (${files.length} fixture(s))`);
    process.exit(0);
  } catch (err) {
    console.error(`❌ User feedback flywheel check failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
