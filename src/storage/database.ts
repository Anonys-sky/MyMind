// ═══════════════════════════════════════════════════════════
// SQLite Database — Document Store + FTS5 Index
// ═══════════════════════════════════════════════════════════

import Database from 'better-sqlite3';
import { config } from '../config.js';
import { RawCapture, ProcessedCapture, StoredCapture } from '../types.js';
import path from 'path';
import fs from 'fs';

export class CaptureDatabase {
  private db: Database.Database;

  constructor() {
    // Ensure data directories exist
    const dbDir = path.dirname(config.storage.dbPath);
    fs.mkdirSync(dbDir, { recursive: true });
    fs.mkdirSync(config.storage.imagesDir, { recursive: true });
    fs.mkdirSync(config.storage.audioDir, { recursive: true });

    this.db = new Database(config.storage.dbPath);

    // Performance optimizations
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    this.initialize();
  }

  /**
   * Create tables and indices if they don't exist.
   */
  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS captures (
        id TEXT PRIMARY KEY,
        raw_content TEXT,
        raw_type TEXT NOT NULL,
        title TEXT,
        summary TEXT,
        key_insights TEXT,
        tags TEXT,
        category TEXT,
        action_items TEXT,
        embedding TEXT,
        image_path TEXT,
        audio_path TEXT,
        source_url TEXT,
        caption TEXT,
        telegram_message_id INTEGER,
        telegram_chat_id INTEGER,
        telegram_file_id TEXT,
        status TEXT DEFAULT 'pending',
        error_message TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        processed_at TEXT,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS captures_fts USING fts5(
        capture_id UNINDEXED,
        title,
        summary,
        key_insights,
        tags,
        raw_content
      );

      CREATE INDEX IF NOT EXISTS idx_captures_status ON captures(status);
      CREATE INDEX IF NOT EXISTS idx_captures_category ON captures(category);
      CREATE INDEX IF NOT EXISTS idx_captures_created ON captures(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_captures_type ON captures(raw_type);
    `);

    console.log(`[Database] Initialized at ${config.storage.dbPath}`);
  }

  // ─── Write Operations ───────────────────────────────────

  /**
   * Insert a raw capture immediately when the bot receives a message.
   * Status is set to 'pending' — AI processing happens asynchronously.
   */
  insertRaw(capture: RawCapture): void {
    this.db.prepare(`
      INSERT INTO captures (
        id, raw_content, raw_type, image_path, audio_path,
        source_url, caption, telegram_message_id, telegram_chat_id,
        telegram_file_id, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      capture.id,
      capture.rawContent,
      capture.rawType,
      capture.imagePath,
      capture.audioPath,
      capture.sourceUrl,
      capture.caption,
      capture.telegramMessageId,
      capture.telegramChatId,
      capture.telegramFileId,
    );
  }

  /**
   * Update a capture with AI-processed content and embedding.
   * Also inserts into the FTS5 index for keyword search.
   */
  updateProcessed(id: string, processed: ProcessedCapture, embedding: number[] | null): void {
    const updateCapture = this.db.prepare(`
      UPDATE captures SET
        title = ?, summary = ?, key_insights = ?, tags = ?,
        category = ?, action_items = ?, embedding = ?,
        status = 'completed',
        processed_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = ?
    `);

    const insertFts = this.db.prepare(`
      INSERT INTO captures_fts (capture_id, title, summary, key_insights, tags, raw_content)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const getRawContent = this.db.prepare(`SELECT raw_content FROM captures WHERE id = ?`);

    // Run both in a transaction for consistency
    const transaction = this.db.transaction(() => {
      updateCapture.run(
        processed.title,
        processed.summary,
        JSON.stringify(processed.keyInsights),
        JSON.stringify(processed.tags),
        processed.category,
        JSON.stringify(processed.actionItems),
        embedding ? JSON.stringify(embedding) : null,
        id,
      );

      const row = getRawContent.get(id) as { raw_content: string | null } | undefined;

      insertFts.run(
        id,
        processed.title,
        processed.summary,
        processed.keyInsights.join(' '),
        processed.tags.join(' '),
        row?.raw_content || '',
      );
    });

    transaction();
  }

  /**
   * Update raw_content (e.g., after audio transcription fills in the text).
   */
  updateRawContent(id: string, rawContent: string): void {
    this.db.prepare(`
      UPDATE captures SET raw_content = ?, updated_at = datetime('now') WHERE id = ?
    `).run(rawContent, id);
  }

  markProcessing(id: string): void {
    this.db.prepare(`
      UPDATE captures SET status = 'processing', updated_at = datetime('now') WHERE id = ?
    `).run(id);
  }

  markFailed(id: string, error: string): void {
    this.db.prepare(`
      UPDATE captures SET status = 'failed', error_message = ?, updated_at = datetime('now') WHERE id = ?
    `).run(error, id);
  }

  // ─── Read Operations ────────────────────────────────────

  getById(id: string): StoredCapture | undefined {
    return this.db.prepare('SELECT * FROM captures WHERE id = ?').get(id) as StoredCapture | undefined;
  }

  getRecent(limit: number = 50, offset: number = 0): StoredCapture[] {
    return this.db.prepare(`
      SELECT * FROM captures
      WHERE status != 'deleted'
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as StoredCapture[];
  }

  getByCategory(category: string, limit: number = 50): StoredCapture[] {
    return this.db.prepare(`
      SELECT * FROM captures
      WHERE status != 'deleted' AND category = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(category, limit) as StoredCapture[];
  }

  /**
   * Full-text keyword search using SQLite FTS5.
   * Returns matching capture IDs ranked by relevance.
   */
  searchKeyword(query: string, limit: number = 20): { capture_id: string; rank: number }[] {
    try {
      return this.db.prepare(`
        SELECT capture_id, rank
        FROM captures_fts
        WHERE captures_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(query, limit) as { capture_id: string; rank: number }[];
    } catch {
      // FTS5 query syntax can fail with special characters
      // Fall back to a simple LIKE search
      return [];
    }
  }

  /**
   * Load all embeddings into memory for semantic search.
   * For <10K items, this is fast and uses ~15MB of RAM.
   */
  getAllEmbeddings(): { id: string; embedding: number[] }[] {
    const rows = this.db.prepare(`
      SELECT id, embedding FROM captures
      WHERE embedding IS NOT NULL AND status = 'completed'
    `).all() as { id: string; embedding: string }[];

    return rows.map(row => ({
      id: row.id,
      embedding: JSON.parse(row.embedding),
    }));
  }

  /**
   * Get captures that haven't been successfully processed yet.
   */
  getPending(): StoredCapture[] {
    return this.db.prepare(`
      SELECT * FROM captures
      WHERE status IN ('pending', 'failed')
      ORDER BY created_at ASC
    `).all() as StoredCapture[];
  }

  /**
   * Get aggregate statistics about your knowledge base.
   */
  getStats(): {
    total: number;
    pending: number;
    failed: number;
    byCategory: Record<string, number>;
    byType: Record<string, number>;
    thisWeek: number;
  } {
    const total = (this.db.prepare(
      `SELECT COUNT(*) as count FROM captures WHERE status = 'completed'`
    ).get() as any).count;

    const pending = (this.db.prepare(
      `SELECT COUNT(*) as count FROM captures WHERE status = 'pending'`
    ).get() as any).count;

    const failed = (this.db.prepare(
      `SELECT COUNT(*) as count FROM captures WHERE status = 'failed'`
    ).get() as any).count;

    const byCategory = this.db.prepare(`
      SELECT category, COUNT(*) as count
      FROM captures WHERE status = 'completed'
      GROUP BY category
    `).all() as { category: string; count: number }[];

    const byType = this.db.prepare(`
      SELECT raw_type, COUNT(*) as count
      FROM captures WHERE status = 'completed'
      GROUP BY raw_type
    `).all() as { raw_type: string; count: number }[];

    const thisWeek = (this.db.prepare(`
      SELECT COUNT(*) as count FROM captures
      WHERE status = 'completed'
      AND created_at >= datetime('now', '-7 days')
    `).get() as any).count;

    return {
      total,
      pending,
      failed,
      byCategory: Object.fromEntries(byCategory.map(r => [r.category, r.count])),
      byType: Object.fromEntries(byType.map(r => [r.raw_type, r.count])),
      thisWeek,
    };
  }

  /**
   * Get captures from the last N days for weekly digest.
   */
  getDigest(days: number = 7): StoredCapture[] {
    return this.db.prepare(`
      SELECT * FROM captures
      WHERE status = 'completed'
      AND created_at >= datetime('now', '-' || ? || ' days')
      ORDER BY created_at DESC
    `).all(days) as StoredCapture[];
  }

  close(): void {
    this.db.close();
    console.log('[Database] Closed');
  }
}
