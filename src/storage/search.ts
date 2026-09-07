// ═══════════════════════════════════════════════════════════
// Hybrid Search Engine — Semantic + Keyword
// ═══════════════════════════════════════════════════════════
//
// For a single-user knowledge base (<10K items), we store
// embeddings in SQLite and compute cosine similarity in JS.
// This is simpler than a vector DB and fast enough for personal use.

import { CaptureDatabase } from './database.js';
import { StoredCapture, SearchResult } from '../types.js';

export class SearchEngine {
  /** In-memory cache of all embeddings for fast similarity search */
  private embeddingCache: Map<string, Float32Array> = new Map();
  private db: CaptureDatabase;

  constructor(db: CaptureDatabase) {
    this.db = db;
    this.loadEmbeddings();
  }

  /**
   * Load all stored embeddings into memory on startup.
   * ~10K items × 384 floats × 4 bytes = ~15MB — trivial.
   */
  loadEmbeddings(): void {
    const embeddings = this.db.getAllEmbeddings();
    this.embeddingCache.clear();
    for (const { id, embedding } of embeddings) {
      this.embeddingCache.set(id, new Float32Array(embedding));
    }
    console.log(`[Search] Loaded ${this.embeddingCache.size} embeddings into cache`);
  }

  /**
   * Add a new embedding to the in-memory cache (called after processing).
   */
  addToCache(id: string, embedding: number[]): void {
    this.embeddingCache.set(id, new Float32Array(embedding));
  }

  /**
   * Compute cosine similarity between two vectors.
   * Returns a value between -1 and 1 (1 = identical meaning).
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }

  /**
   * Find the most semantically similar captures to the query embedding.
   */
  semanticSearch(queryEmbedding: number[], limit: number = 10): { id: string; score: number }[] {
    if (this.embeddingCache.size === 0) return [];

    const queryVec = new Float32Array(queryEmbedding);
    const results: { id: string; score: number }[] = [];

    for (const [id, embedding] of this.embeddingCache) {
      const score = this.cosineSimilarity(queryVec, embedding);
      results.push({ id, score });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Hybrid search combining semantic similarity with keyword matching.
   * Semantic results get a 70% weight, keyword results get 30%.
   * Items matching BOTH rank highest.
   */
  async hybridSearch(
    query: string,
    queryEmbedding: number[] | null,
    limit: number = 10,
  ): Promise<SearchResult[]> {
    const scoreMap = new Map<string, { semantic: number; keyword: number }>();

    // ── Semantic search (meaning-based) ──────────────────
    if (queryEmbedding && this.embeddingCache.size > 0) {
      const semanticResults = this.semanticSearch(queryEmbedding, limit * 3);
      for (const { id, score } of semanticResults) {
        // Only include results above a minimum similarity threshold
        if (score > 0.25) {
          scoreMap.set(id, { semantic: score, keyword: 0 });
        }
      }
    }

    // ── Keyword search (FTS5 exact matching) ─────────────
    try {
      const keywordResults = this.db.searchKeyword(query, limit * 3);
      for (const { capture_id, rank } of keywordResults) {
        const existing = scoreMap.get(capture_id) || { semantic: 0, keyword: 0 };
        // FTS5 rank is negative (lower = better), normalize to 0-1
        existing.keyword = 1 / (1 + Math.abs(rank));
        scoreMap.set(capture_id, existing);
      }
    } catch {
      // FTS5 query syntax errors are non-fatal
    }

    // ── Combine and rank ─────────────────────────────────
    const combined = Array.from(scoreMap.entries())
      .map(([id, scores]) => {
        let finalScore: number;
        let matchType: 'semantic' | 'keyword' | 'hybrid';

        if (scores.semantic > 0 && scores.keyword > 0) {
          finalScore = scores.semantic * 0.7 + scores.keyword * 0.3;
          matchType = 'hybrid';
        } else if (scores.semantic > 0) {
          finalScore = scores.semantic * 0.7;
          matchType = 'semantic';
        } else {
          finalScore = scores.keyword * 0.3;
          matchType = 'keyword';
        }

        return { id, score: finalScore, matchType };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // ── Fetch full capture records ───────────────────────
    const results: SearchResult[] = [];
    for (const { id, score, matchType } of combined) {
      const capture = this.db.getById(id);
      if (capture) {
        results.push({ capture, score, matchType });
      }
    }

    return results;
  }

  get cacheSize(): number {
    return this.embeddingCache.size;
  }
}
