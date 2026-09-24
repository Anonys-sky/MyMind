// ═══════════════════════════════════════════════════════════
// MyMind — Entry Point
// ═══════════════════════════════════════════════════════════
//
// Wires together all modules and starts the system:
//   Database → Search Engine → Processing Pipeline → Telegram Bot
//
// Run with: npm run dev (development)
//           npm start   (production)

import { CaptureDatabase } from './storage/database.js';
import { SearchEngine } from './storage/search.js';
import { ProcessingPipeline } from './processing/index.js';
import { warmupEmbedder } from './processing/embedder.js';
import { createBot } from './bot/index.js';
import { startApiServer } from './api/server.js';
import { config } from './config.js';

async function main(): Promise<void> {
  console.log('');
  console.log('  🧠 M Y M I N D');
  console.log('  ─────────────────────────────────────');
  console.log('  Zero-friction personal knowledge system');
  console.log('');

  // ── Step 1: Initialize database ──────────────────────────
  console.log('[Init] Setting up database...');
  const db = new CaptureDatabase();

  // ── Step 2: Initialize search engine ─────────────────────
  console.log('[Init] Loading search engine...');
  const search = new SearchEngine(db);

  // ── Step 3: Warm up embedding model (async, non-blocking) ─
  console.log('[Init] Loading embedding model in background...');
  warmupEmbedder();

  // ── Step 4: Initialize processing pipeline ───────────────
  const pipeline = new ProcessingPipeline(db, search);

  // ── Step 5: Retry any previously failed captures ─────────
  const retried = await pipeline.retryFailed();
  if (retried > 0) {
    console.log(`[Init] Queued ${retried} failed captures for retry`);
  }

  // ── Step 6: Start Telegram bot ───────────────────────────
  console.log('[Init] Starting Telegram bot...');
  const bot = createBot(db, pipeline, search);

  // Global error handler — bot should never crash
  bot.catch((err) => {
    console.error('[Bot] Error:', err.message || err);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[Shutdown] Closing gracefully...');
    apiServer.close();
    bot.stop();
    db.close();
    console.log('[Shutdown] Done. Goodbye! 👋');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // ── Step 7: Start Express API server ─────────────────────
  console.log('[Init] Starting Express API server...');
  const apiServer = startApiServer(db, search, pipeline);

  // Start with long polling (for local development)
  // For production deployment, switch to webhooks
  await bot.start({
    onStart: (botInfo) => {
      console.log('');
      console.log('  ═══════════════════════════════════════');
      console.log(`  ✅ Bot online: @${botInfo.username}`);
      console.log(`  📱 Send messages on Telegram to capture`);
      console.log(`  🔒 Authorized user: ${config.telegram.allowedUserId}`);
      console.log('  ═══════════════════════════════════════');
      console.log('');
      console.log('  Waiting for messages...');
      console.log('');
    },
  });
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
