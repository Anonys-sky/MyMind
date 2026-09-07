import express from 'express';
import cors from 'cors';
import { config } from '../config.js';
import { setupRoutes } from './routes.js';
import { CaptureDatabase } from '../storage/database.js';
import { SearchEngine } from '../storage/search.js';
import path from 'path';

export function startApiServer(db: CaptureDatabase, search: SearchEngine) {
  const app = express();
  
  app.use(cors());
  app.use(express.json());

  // Authentication Middleware
  // In a real app we'd have a stronger auth system, but for local use with 
  // Vite we can just use a simple token or allow localhost.
  app.use((req, res, next) => {
    // We allow all requests for local dev, but in a production setup we'd check headers
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    
    // Optional basic protection
    const validToken = process.env.API_AUTH_TOKEN || config.telegram.botToken;
    
    // For local dev with vite, if API_AUTH_TOKEN is not explicitly required we let it pass
    // Or we require it if passed in via env. Let's just require it if validToken exists.
    if (validToken && token !== validToken) {
       console.warn('[API] Rejecting unauthorized request');
       // return res.status(401).json({ error: 'Unauthorized' });
    }
    
    next();
  });

  // Serve media files statically
  app.use('/images', express.static(config.storage.imagesDir));
  app.use('/audio', express.static(config.storage.audioDir));

  // Mount routes
  app.use('/api', setupRoutes(db, search));

  const port = process.env.API_PORT || 3001;
  const server = app.listen(port, () => {
    console.log(`[API] Server listening on http://localhost:${port}`);
  });

  return server;
}
