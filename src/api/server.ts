import express from 'express';
import cors from 'cors';
import { config } from '../config.js';
import { setupRoutes } from './routes.js';
import { CaptureDatabase } from '../storage/database.js';
import { SearchEngine } from '../storage/search.js';
import path from 'path';

import { ProcessingPipeline } from '../processing/index.js';

export function startApiServer(db: CaptureDatabase, search: SearchEngine, pipeline?: ProcessingPipeline) {
  const app = express();
  
  app.use(cors());
  app.use(express.json());

  // Authentication Middleware
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    
    // Optional basic protection
    const validToken = process.env.API_AUTH_TOKEN;
    if (validToken && token !== validToken) {
       console.warn('[API] Rejecting unauthorized request');
       return res.status(401).json({ error: 'Unauthorized' });
    }
    
    next();
  });

  // Serve media files statically
  app.use('/images', express.static(config.storage.imagesDir));
  app.use('/audio', express.static(config.storage.audioDir));

  // Mount routes
  app.use('/api', setupRoutes(db, search, pipeline));

  const port = process.env.API_PORT || 3001;
  const server = app.listen(port, () => {
    console.log(`[API] Server listening on http://localhost:${port}`);
  });

  return server;
}
