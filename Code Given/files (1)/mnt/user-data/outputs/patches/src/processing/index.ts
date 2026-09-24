// ═══════════════════════════════════════════════════════════
// Processing Pipeline Coordinator
// ═══════════════════════════════════════════════════════════
//
// Orchestrates the full processing flow:
//   Raw capture → (re-download if needed) → Transcribe/OCR →
//   Structure → Embed → Store
//
// CHANGED: added a "Step 0" that re-downloads the image/audio file
// from Telegram if the capture reaches here with a telegramFileId
// but no local imagePath/audioPath. This is what makes /retry
// actually work for a capture whose original background download
// failed (see bot/index.ts) — previously, retrying such a capture
// would immediately fail again with "No content to process after
// extraction", because the local file genuinely never existed and
// nothing ever tried to fetch it a second time.

import { RawCapture, ProcessedCapture } from '../types.js';
import { transcribeAudio } from './transcriber.js';
import { analyzeImage } from './vision.js';
import { structureContent } from './structurer.js';
import { generateEmbedding } from './embedder.js';
import { CaptureDatabase } from '../storage/database.js';
import { SearchEngine } from '../storage/search.js';
import { fetchTelegramFilePath, downloadTelegramFile } from '../utils/telegram.js';
import path from 'path';

export class ProcessingPipeline {
  private queue: (() => Promise<void>)[] = [];
  private isProcessing = false;
  private db: CaptureDatabase;
  private search: SearchEngine;

  constructor(db: CaptureDatabase, search: SearchEngine) {
    this.db = db;
    this.search = search;
  }

  enqueue(capture: RawCapture): void {
    this.queue.push(() => this.process(capture));
    this.drain();
  }

  private async drain(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      try {
        await task();
      } catch (error) {
        console.error('[Pipeline] Unhandled task error:', error);
      }

      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    this.isProcessing = false;
  }

  private async process(capture: RawCapture): Promise<void> {
    const shortId = capture.id.substring(0, 8);
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`[Pipeline] Processing ${shortId} (${capture.rawType})`);
    console.log(`${'─'.repeat(50)}`);

    this.db.markProcessing(capture.id);

    try {
      // ── Step 0: Re-download media if a prior attempt never finished ──
      // Happens when the background download in bot/index.ts failed and
      // this capture is being replayed via /retry or on startup.
      if (capture.rawType === 'photo' && !capture.imagePath && capture.telegramFileId) {
        console.log(`[Pipeline] Step 0: Re-downloading missing image...`);
        const telegramFilePath = await fetchTelegramFilePath(capture.telegramFileId);
        const ext = path.extname(telegramFilePath) || '.jpg';
        capture.imagePath = await downloadTelegramFile(telegramFilePath, capture.id, 'images', ext);
        this.db.updateMediaPath(capture.id, 'image_path', capture.imagePath);
      }

      if (capture.rawType === 'voice' && !capture.audioPath && capture.telegramFileId) {
        console.log(`[Pipeline] Step 0: Re-downloading missing audio...`);
        const telegramFilePath = await fetchTelegramFilePath(capture.telegramFileId);
        const ext = path.extname(telegramFilePath) || '.ogg';
        capture.audioPath = await downloadTelegramFile(telegramFilePath, capture.id, 'audio', ext);
        this.db.updateMediaPath(capture.id, 'audio_path', capture.audioPath);
      }

      // ── Step 1: Extract raw text ────────────────────────
      let rawText = capture.rawContent || '';

      if (capture.rawType === 'voice' && capture.audioPath) {
        console.log(`[Pipeline] Step 1: Transcribing voice memo...`);
        rawText = await transcribeAudio(capture.audioPath);
        this.db.updateRawContent(capture.id, rawText);
      }

      if (capture.rawType === 'photo' && capture.imagePath) {
        console.log(`[Pipeline] Step 1: Analyzing image...`);
        const imageDescription = await analyzeImage(capture.imagePath);
        rawText = capture.caption
          ? `User's note: ${capture.caption}\n\n---\n\nImage content:\n${imageDescription}`
          : imageDescription;
        this.db.updateRawContent(capture.id, rawText);
      }

      if (!rawText || rawText.trim().length === 0) {
        throw new Error('No content to process after extraction');
      }

      // ── Step 2: Structure with LLM ──────────────────────
      console.log(`[Pipeline] Step 2: Structuring with AI...`);
      const processed = await structureContent(rawText, capture.rawType, capture.caption);

      // ── Step 3: Generate embedding ──────────────────────
      console.log(`[Pipeline] Step 3: Generating embedding...`);
      const embeddingText = [
        processed.title,
        processed.summary,
        processed.tags.join(' '),
        processed.keyInsights.join(' '),
      ].join(' ');
      const embedding = await generateEmbedding(embeddingText);

      // ── Step 4: Store everything ────────────────────────
      console.log(`[Pipeline] Step 4: Storing processed capture...`);
      this.db.updateProcessed(capture.id, processed, embedding);

      if (embedding) {
        this.search.addToCache(capture.id, embedding);
      }

      console.log(`[Pipeline] ✅ Done: "${processed.title}" [${processed.category}]`);
      if (processed.actionItems.length > 0) {
        console.log(`[Pipeline] 📋 Action items: ${processed.actionItems.join(', ')}`);
      }
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      console.error(`[Pipeline] ❌ Failed ${shortId}: ${errorMsg}`);
      this.db.markFailed(capture.id, errorMsg);
    }
  }

  async retryFailed(): Promise<number> {
    const pending = this.db.getPending();
    if (pending.length === 0) return 0;

    console.log(`[Pipeline] Retrying ${pending.length} pending/failed captures`);

    for (const row of pending) {
      const capture: RawCapture = {
        id: row.id,
        rawContent: row.raw_content,
        rawType: row.raw_type as RawCapture['rawType'],
        imagePath: row.image_path,
        audioPath: row.audio_path,
        sourceUrl: row.source_url,
        telegramMessageId: row.telegram_message_id,
        telegramChatId: row.telegram_chat_id,
        telegramFileId: row.telegram_file_id,
        caption: row.caption,
      };
      this.enqueue(capture);
    }

    return pending.length;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  get busy(): boolean {
    return this.isProcessing;
  }
}
