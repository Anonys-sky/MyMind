import { Router } from 'express';
import { CaptureDatabase } from '../storage/database.js';
import { SearchEngine } from '../storage/search.js';
import { generateEmbedding } from '../processing/embedder.js';

export function setupRoutes(db: CaptureDatabase, search: SearchEngine): Router {
  const router = Router();

  // 1. Get recent captures
  router.get('/captures', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const category = req.query.category as string;

      let captures;
      if (category) {
        captures = db.getByCategory(category, limit);
      } else {
        captures = db.getRecent(limit, offset);
      }
      res.json({ success: true, captures });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 2. Get specific capture
  router.get('/captures/:id', (req, res) => {
    try {
      const capture = db.getById(req.params.id);
      if (!capture) {
        return res.status(404).json({ success: false, error: 'Not found' });
      }
      res.json({ success: true, capture });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 3. Search (Hybrid)
  router.post('/search', async (req, res) => {
    try {
      const { query, limit = 20 } = req.body;
      if (!query) {
        return res.status(400).json({ success: false, error: 'Query is required' });
      }

      // Generate embedding for query
      const queryEmbedding = await generateEmbedding(query);

      // Perform hybrid search
      const results = await search.hybridSearch(query, queryEmbedding, limit);
      res.json({ success: true, results });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 4. Get Stats
  router.get('/stats', (req, res) => {
    try {
      const stats = db.getStats();
      res.json({ success: true, stats });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // 5. Delete capture (soft delete)
  router.delete('/captures/:id', (req, res) => {
    try {
      // In typescript we need to cast to any to access private db, or just add a delete method.
      // But since we want to avoid changing database.ts for now, let's cast.
      (db as any).db.prepare(`UPDATE captures SET status = 'deleted', updated_at = datetime('now') WHERE id = ?`).run(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}
