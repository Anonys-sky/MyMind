// ═══════════════════════════════════════════════════════════
// MyMind Type Definitions
// ═══════════════════════════════════════════════════════════

/** Content types that the bot can receive */
export type CaptureType = 'text' | 'voice' | 'photo' | 'document' | 'link' | 'forward';

/** Knowledge categories assigned by the AI structurer */
export type CaptureCategory = 'idea' | 'reference' | 'task' | 'quote' | 'link' | 'learning' | 'other';

/** Processing status of a capture */
export type CaptureStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Raw capture data extracted from a Telegram message.
 * This is created immediately when the bot receives a message,
 * before any AI processing happens.
 */
export interface RawCapture {
  id: string;
  rawContent: string | null;
  rawType: CaptureType;
  imagePath: string | null;
  audioPath: string | null;
  sourceUrl: string | null;
  telegramMessageId: number;
  telegramChatId: number;
  telegramFileId: string | null;
  caption: string | null;
}

/**
 * Output from the AI structuring pipeline.
 * This is what the LLM produces after processing raw content.
 */
export interface ProcessedCapture {
  title: string;
  summary: string;
  keyInsights: string[];
  tags: string[];
  category: CaptureCategory;
  actionItems: string[];
}

/**
 * A capture as stored in SQLite (snake_case column names).
 * Combines raw input, processed output, embedding, and metadata.
 */
export interface StoredCapture {
  id: string;
  raw_content: string | null;
  raw_type: string;
  title: string | null;
  summary: string | null;
  key_insights: string | null; // JSON array
  tags: string | null; // JSON array
  category: string | null;
  action_items: string | null; // JSON array
  embedding: string | null; // JSON array of 384 floats
  image_path: string | null;
  audio_path: string | null;
  source_url: string | null;
  caption: string | null;
  ocr_text: string | null; // Phase 2: literal OCR transcription from images
  ai_notes: string | null; // Phase 2: AI interpretive description (separate from OCR)
  image_hash: string | null; // Phase 2: SHA-256 content hash for dedup
  telegram_message_id: number;
  telegram_chat_id: number;
  telegram_file_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
  updated_at: string;
}

/**
 * A search result combining the capture data with relevance scoring.
 */
export interface SearchResult {
  capture: StoredCapture;
  score: number;
  matchType: 'semantic' | 'keyword' | 'hybrid';
}
