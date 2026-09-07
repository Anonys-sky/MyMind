// ═══════════════════════════════════════════════════════════
// Processing Pipeline Coordinator
// ═══════════════════════════════════════════════════════════
//
// Orchestrates the full processing flow:
//   Raw capture → Transcribe/OCR → Structure → Embed → Store
//
// Uses a serial queue to prevent rate limit issues with Groq
// (tasks processed one at a time, but bot is never blocked).

import { RawCapture, ProcessedCapture } from '../types.js';
import { transcribeAudio } from './transcriber.js';
import { analyzeImage } from './vision.js';
import { structureContent } from './structurer.js';
import { generateEmbedding } from './embedder.js';
import { CaptureDatabase } from '../storage/database.js';
import { SearchEngine } from '../storage/search.js';

export class ProcessingPipeline {
  private queue: (() => Promise<void>)[] = [];
  private isProcessing = false;
  private db: CaptureDatabase;
  private search: SearchEngine;

  constructor(db: CaptureDatabase, search: SearchEngine) {
    this.db = db;
    this.search = search;
  }

  /**
   * Add a capture to the processing queue.
   * The bot calls this immediately after saving raw data — it doesn't wait.
   */
  enqueue(capture: RawCapture): void {
    this.queue.push(() => this.process(capture));
    this.drain();
  }

  /**
   * Process the queue serially (one at a time) to respect rate limits.
   */
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

      // Small delay between tasks to be kind to Groq rate limits
      if (this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    this.isProcessing = false;
  }

  /**
   * Process a single capture through the full pipeline:
   * 1. Extract raw text (transcribe audio or analyze image)
   * 2. Structure with LLM (title, summary, tags, category)
   * 3. Generate embedding vector
   * 4. Store everything in SQLite + update search cache
   */
  private async process(capture: RawCapture): Promise<void> {
    const shortId = capture.id.substring(0, 8);
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`[Pipeline] Processing ${shortId} (${capture.rawType})`);
    console.log(`${'─'.repeat(50)}`);

    this.db.markProcessing(capture.id);

    try {
      // ── Step 1: Extract raw text ────────────────────────
      let rawText = capture.rawContent || '';

      if (capture.rawType === 'voice' && capture.audioPath) {
        console.log(`[Pipeline] Step 1: Transcribing voice memo...`);
        rawText = await transcribeAudio(capture.audioPath);
        // Save transcription as raw_content for future reference
        this.db.updateRawContent(capture.id, rawText);
      }

      if (capture.rawType === 'photo' && capture.imagePath) {
        console.log(`[Pipeline] Step 1: Analyzing image...`);
        const imageDescription = await analyzeImage(capture.imagePath);
        rawText = capture.caption
          ? `User's note: ${capture.caption}\n\n---\n\nImage content:\n${imageDescription}`
          : imageDescription;
        // Save image analysis as raw_content
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

      // Update search cache
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

  /**
   * Re-process any captures that failed or are still pending.
   * Called on startup to handle items that failed due to API issues.
   */
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

  /** Number of items waiting in the queue */
  get queueLength(): number {
    return this.queue.length;
  }

  /** Whether the pipeline is currently processing */
  get busy(): boolean {
    return this.isProcessing;
  }
}
