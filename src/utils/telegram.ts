// ═══════════════════════════════════════════════════════════
// Telegram File Helpers — shared between bot and pipeline
// ═══════════════════════════════════════════════════════════
//
// Moved out of bot/index.ts because processing/index.ts
// now needs to re-attempt failed downloads during /retry, and
// bot/index.ts needs to enqueue into the pipeline — if this code
// lived inside bot/index.ts, the two modules would import each
// other (a circular import).

import { config } from '../config.js';
import fs from 'fs';
import path from 'path';

/**
 * Ask Telegram for the current server-side path of a file, given its
 * file_id. Uses a plain HTTP call rather than the grammy Bot instance,
 * so this works from both the bot handlers and the background pipeline
 * without either needing a reference to the other.
 *
 * Note: Telegram file_ids for a given file remain valid to re-fetch for
 * a reasonable window, but there's no published guaranteed TTL — retry
 * failed downloads promptly (within days, not months) rather than
 * relying on this working indefinitely.
 */
export async function fetchTelegramFilePath(fileId: string): Promise<string> {
  const url = `https://api.telegram.org/bot${config.telegram.botToken}/getFile?file_id=${fileId}`;
  const res = await fetch(url);
  const data: any = await res.json();

  if (!data.ok) {
    throw new Error(`Telegram getFile failed: ${data.description || res.statusText}`);
  }

  return data.result.file_path;
}

/**
 * Download a file from Telegram's servers to local storage.
 */
export async function downloadTelegramFile(
  telegramFilePath: string,
  captureId: string,
  subdir: 'images' | 'audio',
  ext: string,
): Promise<string> {
  const url = `https://api.telegram.org/file/bot${config.telegram.botToken}/${telegramFilePath}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const dir = subdir === 'images' ? config.storage.imagesDir : config.storage.audioDir;
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${captureId}${ext}`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);

  console.log(`[Download] Saved: ${filePath} (${formatBytes(buffer.length)})`);
  return filePath;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
