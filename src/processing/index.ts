// ═══════════════════════════════════════════════════════════
// Processing Pipeline Coordinator
// ═══════════════════════════════════════════════════════════
//
// Orchestrates the full processing flow:
//   Raw capture → Compress → Dedup → Transcribe/OCR → Structure → Embed → Store
//
// Phase 2 additions:
//   - Image compression before storage + Vision API call
//   - Split Vision output into ocr_text + ai_notes
//   - Image hash dedup to prevent storing duplicate photos
//
// Uses a serial queue to prevent rate limit issues with Groq
// (tasks processed one at a time, but bot is never blocked).

import { RawCapture, ProcessedCapture } from '../types.js';
import { transcribeAudio } from './transcriber.js';
import { analyzeImage } from './vision.js';
import { structureContent } from './structurer.js';
import { generateEmbedding } from './embedder.js';
import { compressImage, hashImage } from './imageproc.js';
import { CaptureDatabase } from '../storage/database.js';
import { SearchEngine } from '../storage/search.js';

export class ProcessingPipeline {
  private queue: (() => Promise<void>)[] = [];
  private isProcessing = false;
  private db: CaptureDatabase;
  private search: SearchEngine;

  /** Optional callback fired when a capture is successfully processed */
  public onProcessed?: (captureId: string, processed: ProcessedCapture) => Promise<void>;

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
   * 1. Compress image (if photo) + check for duplicates
   * 2. Extract raw text (transcribe audio or analyze image)
   * 3. Structure with LLM (title, summary, tags, category)
   * 4. Generate embedding vector
   * 5. Store everything in SQLite + update search cache
   */
  private async process(capture: RawCapture): Promise<void> {
    const shortId = capture.id.substring(0, 8);
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`[Pipeline] Processing ${shortId} (${capture.rawType})`);
    console.log(`${'─'.repeat(50)}`);

    this.db.markProcessing(capture.id);

    try {
      // ── Step 0: Image compression + dedup (Phase 2) ─────
      if (capture.rawType === 'photo' && capture.imagePath) {
        // Compress the image (resize to 1600px max, JPEG 80%)
        try {
          console.log(`[Pipeline] Step 0: Compressing image...`);
          const { outputPath } = await compressImage(capture.imagePath);
          // Update the path if extension changed (e.g. .png → .jpg)
          if (outputPath !== capture.imagePath) {
            capture.imagePath = outputPath;
            this.db.updateMediaPath(capture.id, 'image_path', outputPath);
          }
        } catch (compressErr: any) {
          console.warn(`[Pipeline] Image compression failed (non-fatal): ${compressErr.message}`);
          // Continue with original image — compression is nice-to-have, not blocking
        }

        // Check for duplicate by content hash
        try {
          const imageHash = await hashImage(capture.imagePath);
          const existingDup = this.db.getByImageHash(imageHash);

          if (existingDup) {
            console.log(`[Pipeline] ⚠️ Duplicate image detected (matches ${existingDup.id.substring(0, 8)})`);
            // Store the hash but mark as completed with a note
            this.db.updateImageMeta(capture.id, null, null, imageHash);
            // Still store it — the PRD says "nothing is ever deleted unless I explicitly delete it"
            // but log the duplicate so the user sees it in raw_content
            const dupNote = `[Duplicate of capture ${existingDup.id.substring(0, 8)}: "${existingDup.title || 'Untitled'}"]`;
            this.db.updateRawContent(capture.id, dupNote);
            // Don't skip processing — the user might have added a different caption
          } else {
            // Save hash for future dedup checks
            this.db.updateImageMeta(capture.id, null, null, imageHash);
          }
        } catch (hashErr: any) {
          console.warn(`[Pipeline] Image hashing failed (non-fatal): ${hashErr.message}`);
        }
      }

      // ── Step 1: Extract raw text ────────────────────────
      let rawText = capture.rawContent || '';

      if (capture.rawType === 'voice' && capture.audioPath) {
        console.log(`[Pipeline] Step 1: Transcribing voice memo...`);
        rawText = await transcribeAudio(capture.audioPath);
        // Save transcription as raw_content for future reference
        this.db.updateRawContent(capture.id, rawText);
      }

      if (capture.rawType === 'photo' && capture.imagePath) {
        console.log(`[Pipeline] Step 1: Analyzing image (split OCR + AI notes)...`);
        const visionResult = await analyzeImage(capture.imagePath);

        // Phase 2: Store OCR text and AI notes separately
        this.db.updateImageMeta(
          capture.id,
          visionResult.ocrText || null,
          visionResult.aiNotes || null,
          null, // hash already set above, pass null to keep it
        );

        // Build raw_content from BOTH for structuring, but keep
        // the two conceptually separate in the DB
        rawText = '';
        if (capture.caption) {
          rawText += `User's note: ${capture.caption}\n\n---\n\n`;
        }
        if (visionResult.ocrText) {
          rawText += `Text visible in image:\n${visionResult.ocrText}\n\n`;
        }
        if (visionResult.aiNotes) {
          rawText += `Image description:\n${visionResult.aiNotes}`;
        }

        // Save combined text as raw_content (for backward compat with FTS)
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

      // Notify caller (bot) that processing is complete
      if (this.onProcessed) {
        try {
          await this.onProcessed(capture.id, processed);
        } catch (cbError: any) {
          console.error(`[Pipeline] onProcessed callback failed:`, cbError);
        }
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
