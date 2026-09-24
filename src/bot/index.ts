// ═══════════════════════════════════════════════════════════
// Telegram Bot — The Capture Interface
// ═══════════════════════════════════════════════════════════
//
// This is the ONLY input interface. You send messages to this
// bot from your phone or desktop Telegram — text, voice, photos,
// links, forwards — and it captures everything instantly.
//
// CHANGED: for every media type (photo/voice/audio/video_note),
// the raw row is now inserted and the ✅ ack is sent BEFORE the
// Telegram file download runs. Previously the download happened
// first, which (a) meant slow downloads delayed the "instant" ack,
// contradicting the whole point of this bot, and (b) meant a failed
// download never created a database row at all, so /retry had
// nothing to retry — the capture was just silently gone.
//
// The download+enqueue now happens in the background via
// captureMediaThenEnqueue(). If it fails, the row already exists
// and gets marked 'failed', so /retry can genuinely recover it —
// see processing/index.ts for the matching re-download logic.

import { Bot, Context } from 'grammy';
import { config } from '../config.js';
import { RawCapture } from '../types.js';
import { ProcessingPipeline } from '../processing/index.js';
import { CaptureDatabase } from '../storage/database.js';
import { SearchEngine } from '../storage/search.js';
import { generateEmbedding } from '../processing/embedder.js';
import { downloadTelegramFile, formatBytes } from '../utils/telegram.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

/**
 * Create and configure the Telegram bot with all message handlers.
 *
 * NOTE: signature changed — now takes `search` as a third argument
 * so /search and /tag can use the already-built hybrid search engine.
 * Update the call site (wherever createBot(db, pipeline) is currently
 * called, likely src/index.ts) to createBot(db, pipeline, search).
 */
export function createBot(db: CaptureDatabase, pipeline: ProcessingPipeline, search: SearchEngine): Bot {
  const bot = new Bot(config.telegram.botToken);

  // ── Security middleware: only accept from authorized user ──
  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== config.telegram.allowedUserId) {
      if (ctx.message) {
        console.warn(`[Bot] ⚠️ Rejected message from unauthorized user: ${ctx.from?.id} (@${ctx.from?.username})`);
      }
      return;
    }
    await next();
  });

  // ── /start command ────────────────────────────────────────
  bot.command('start', async (ctx) => {
    await ctx.reply(
      `🧠 *MyMind — Your Second Brain*\n\n` +
      `Send me anything and I'll remember it for you:\n\n` +
      `📝 *Text* — thoughts, ideas, quick notes\n` +
      `🎤 *Voice* — ramble freely, I'll transcribe & structure it\n` +
      `📸 *Photos* — screenshots, whiteboards, designs\n` +
      `🔗 *Links* — articles, posts, resources\n` +
      `↩️ *Forwards* — messages from other chats\n` +
      `📎 *Files* — documents with useful content\n\n` +
      `Everything is processed by AI and made searchable.\n` +
      `*Zero organization required.*\n\n` +
      `Commands:\n` +
      `/search <query> — Find anything you've saved\n` +
      `/tag <id> tag1, tag2 — Fix a capture's tags\n` +
      `/stats — View your knowledge base statistics\n` +
      `/recent [category] — Show last 5 captures (optionally filter by category)\n` +
      `/retry — Re-process any failed captures\n\n` +
      `Categories: idea, reference, task, quote, link, learning, other`,
      { parse_mode: 'Markdown' },
    );
  });

  // ── /stats command ────────────────────────────────────────
  bot.command('stats', async (ctx) => {
    const stats = db.getStats();

    const categoryEmojis: Record<string, string> = {
      idea: '💡', reference: '📚', task: '✅',
      quote: '💬', link: '🔗', learning: '🎓', other: '📌',
    };

    const typeEmojis: Record<string, string> = {
      text: '📝', voice: '🎤', photo: '📸',
      document: '📎', link: '🔗', forward: '↩️',
    };

    const categoryLines = Object.entries(stats.byCategory)
      .sort(([, a], [, b]) => b - a)
      .map(([cat, count]) => `  ${categoryEmojis[cat] || '📌'} ${cat}: ${count}`)
      .join('\n');

    const typeLines = Object.entries(stats.byType)
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => `  ${typeEmojis[type] || '📄'} ${type}: ${count}`)
      .join('\n');

    await ctx.reply(
      `📊 *MyMind Statistics*\n\n` +
      `Total captures: *${stats.total}*\n` +
      `This week: *${stats.thisWeek}*\n` +
      `Pending: ${stats.pending} | Failed: ${stats.failed}\n\n` +
      `*By Category:*\n${categoryLines || '  (none yet)'}\n\n` +
      `*By Source:*\n${typeLines || '  (none yet)'}`,
      { parse_mode: 'Markdown' },
    );
  });

  // ── /recent command ───────────────────────────────────────
  // Shows short id for /tag. Accepts optional category filter:
  // /recent        → last 5 of any category
  // /recent learning → last 5 in "learning" category
  bot.command('recent', async (ctx) => {
    const categoryFilter = ctx.match?.trim().toLowerCase() || null;
    const VALID_CATS = ['idea', 'reference', 'task', 'quote', 'link', 'learning', 'other'];

    let recent;
    if (categoryFilter && VALID_CATS.includes(categoryFilter)) {
      recent = db.getByCategory(categoryFilter, 5);
    } else {
      recent = db.getRecent(5);
    }

    if (recent.length === 0) {
      const suffix = categoryFilter ? ` in "${categoryFilter}"` : '';
      await ctx.reply(`No captures${suffix} yet. Send me something!`);
      return;
    }

    const lines = recent.map((c) => {
      const tags = c.tags ? JSON.parse(c.tags).join(', ') : '';
      const date = new Date(c.created_at + 'Z').toLocaleDateString();
      const shortId = c.id.substring(0, 8);
      return `\`${shortId}\` *${c.title || 'Untitled'}*\n   ${c.category || 'other'} • ${date}\n   ${tags}`;
    });

    const header = categoryFilter ? `📋 *Recent — ${categoryFilter}*` : `📋 *Recent Captures*`;
    await ctx.reply(
      `${header}\n\n${lines.join('\n\n')}`,
      { parse_mode: 'Markdown' },
    );
  });

  // ── /search command — NEW ──────────────────────────────────
  // Wires up the hybrid search engine (storage/search.ts) that
  // already existed but had no way to be invoked from the bot.
  bot.command('search', async (ctx) => {
    const query = ctx.match?.trim();
    if (!query) {
      await ctx.reply('Usage: /search <query>\nExample: /search pricing psychology');
      return;
    }

    const queryEmbedding = await generateEmbedding(query);
    const results = await search.hybridSearch(query, queryEmbedding, 5);

    if (results.length === 0) {
      await ctx.reply(`No results for "${query}". Try different words, or check /recent.`);
      return;
    }

    const lines = results.map(({ capture, matchType }) => {
      const shortId = capture.id.substring(0, 8);
      const tags = capture.tags ? JSON.parse(capture.tags).join(', ') : '';
      const date = new Date(capture.created_at + 'Z').toLocaleDateString();
      const snippet = (capture.summary || capture.raw_content || '').slice(0, 120).trim();
      return (
        `\`${shortId}\` *${capture.title || 'Untitled'}* _(${matchType})_\n` +
        `   ${capture.category || 'other'} • ${date}\n` +
        `   ${snippet}${snippet.length === 120 ? '…' : ''}\n` +
        `   ${tags ? tags : ''}`
      );
    });

    await ctx.reply(`🔎 *Results for "${query}"*\n\n${lines.join('\n\n')}`, { parse_mode: 'Markdown' });
  });

  // ── /tag command — NEW ─────────────────────────────────────
  // The one-tap correction loop that was entirely missing:
  // /tag <short-id> tag1, tag2, tag3
  bot.command('tag', async (ctx) => {
    const raw = ctx.match?.trim() ?? '';
    const firstSpace = raw.indexOf(' ');

    if (!raw || firstSpace === -1) {
      await ctx.reply(
        'Usage: /tag <id> tag1, tag2, tag3\n' +
        'Get the id (the short code in backticks) from /recent or /search.',
      );
      return;
    }

    const shortId = raw.slice(0, firstSpace).trim();
    const newTags = raw.slice(firstSpace + 1).split(',').map(t => t.trim()).filter(Boolean);

    if (newTags.length === 0) {
      await ctx.reply('No tags provided. Usage: /tag <id> tag1, tag2, tag3');
      return;
    }

    const capture = db.getByShortId(shortId);
    if (!capture) {
      await ctx.reply(`Couldn't find a capture starting with "${shortId}". Check /recent for valid ids.`);
      return;
    }

    db.updateTags(capture.id, newTags);
    await ctx.reply(`✅ Updated tags for "${capture.title || 'Untitled'}": ${newTags.join(', ')}`);
  });

  // ── /retry command ────────────────────────────────────────
  bot.command('retry', async (ctx) => {
    const count = await pipeline.retryFailed();
    if (count === 0) {
      await ctx.reply('✅ No failed captures to retry.');
    } else {
      await ctx.reply(`🔄 Retrying ${count} failed/pending capture(s)...`);
    }
  });

  // ── Text messages ─────────────────────────────────────────
  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;

    const capture = newCapture(ctx, 'text');
    capture.rawContent = ctx.message.text;

    const urlRegex = /^https?:\/\/\S+$/;
    if (urlRegex.test(ctx.message.text.trim())) {
      capture.rawType = 'link';
      capture.sourceUrl = ctx.message.text.trim();
    }

    db.insertRaw(capture);
    await ctx.reply('✅');
    pipeline.enqueue(capture);
  });

  // ── Voice messages ────────────────────────────────────────
  // CHANGED: insert + ack happen before the download now.
  bot.on('message:voice', async (ctx) => {
    const capture = newCapture(ctx, 'voice');
    capture.telegramFileId = ctx.message.voice.file_id;

    db.insertRaw(capture);
    await ctx.reply('✅ 🎤');

    captureMediaThenEnqueue(ctx, db, pipeline, capture, ctx.message.voice.file_id, 'audio', '.ogg');
  });

  // ── Audio files (MP3 etc. sent as audio) ──────────────────
  bot.on('message:audio', async (ctx) => {
    const capture = newCapture(ctx, 'voice');
    capture.caption = ctx.message.caption || null;
    capture.telegramFileId = ctx.message.audio.file_id;

    db.insertRaw(capture);
    await ctx.reply('✅ 🎵');

    const ext = path.extname(ctx.message.audio.file_name || '.mp3') || '.mp3';
    captureMediaThenEnqueue(ctx, db, pipeline, capture, ctx.message.audio.file_id, 'audio', ext);
  });

  // ── Photos ────────────────────────────────────────────────
  // CHANGED: this is the main fix. Previously awaited the full
  // download before insertRaw + reply, which both delayed the ack
  // for your primary use case (screenshots) and meant a failed
  // download left no trace to retry.
  bot.on('message:photo', async (ctx) => {
    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1];

    const capture = newCapture(ctx, 'photo');
    capture.caption = ctx.message.caption || null;
    capture.telegramFileId = largest.file_id;

    db.insertRaw(capture);
    await ctx.reply('✅ 📸');

    captureMediaThenEnqueue(ctx, db, pipeline, capture, largest.file_id, 'images', '.jpg');
  });

  // ── Documents ─────────────────────────────────────────────
  bot.on('message:document', async (ctx) => {
    const doc = ctx.message.document;
    const mime = doc.mime_type || '';
    const capture = newCapture(ctx, 'document');
    capture.caption = ctx.message.caption || null;

    try {
      if (mime.startsWith('image/')) {
        capture.rawType = 'photo';
        capture.telegramFileId = doc.file_id;

        db.insertRaw(capture);
        await ctx.reply('✅ 📸');

        const ext = path.extname(doc.file_name || '.jpg') || '.jpg';
        captureMediaThenEnqueue(ctx, db, pipeline, capture, doc.file_id, 'images', ext);
        return;
      }

      capture.rawContent = [
        `Document: ${doc.file_name || 'Unknown'}`,
        `Type: ${mime || 'Unknown'}`,
        `Size: ${formatBytes(doc.file_size || 0)}`,
        capture.caption ? `\nCaption: ${capture.caption}` : '',
      ].filter(Boolean).join('\n');

      db.insertRaw(capture);
      await ctx.reply('✅ 📎');
      pipeline.enqueue(capture);
    } catch (error: any) {
      console.error('[Bot] Failed to process document:', error.message);
      await ctx.reply('❌ Failed to capture document. Try again?');
    }
  });

  // ── Video notes (round videos) ────────────────────────────
  bot.on('message:video_note', async (ctx) => {
    const capture = newCapture(ctx, 'voice');
    capture.rawContent = '(Video note — audio will be processed)';
    capture.telegramFileId = ctx.message.video_note.file_id;

    db.insertRaw(capture);
    await ctx.reply('✅ 🎥');

    captureMediaThenEnqueue(ctx, db, pipeline, capture, ctx.message.video_note.file_id, 'audio', '.mp4');
  });

  // ── Catch-all for unsupported message types ───────────────
  bot.on('message:sticker', async (ctx) => {
    await ctx.reply('🤔 Stickers aren\'t useful as knowledge. Send text, voice, or photos!');
  });

  bot.on('message:animation', async (ctx) => {
    await ctx.reply('🤔 GIFs aren\'t useful as knowledge. Send text, voice, or photos!');
  });

  return bot;
}

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function newCapture(ctx: Context, type: RawCapture['rawType']): RawCapture {
  return {
    id: uuidv4(),
    rawContent: null,
    rawType: type,
    imagePath: null,
    audioPath: null,
    sourceUrl: null,
    telegramMessageId: ctx.message?.message_id || 0,
    telegramChatId: ctx.chat?.id || 0,
    telegramFileId: null,
    caption: null,
  };
}

/**
 * Download the media for a capture that has ALREADY been inserted and
 * ALREADY been ack'd, then enqueue it for AI processing. Runs in the
 * background (not awaited by the caller) so the bot's reply is never
 * blocked on Telegram's file servers.
 *
 * On failure, marks the row 'failed' rather than throwing away the
 * capture — the row exists (it was inserted before this ran), so
 * /retry can find it and processing/index.ts will re-attempt the
 * download itself before giving up again.
 */
async function captureMediaThenEnqueue(
  ctx: Context,
  db: CaptureDatabase,
  pipeline: ProcessingPipeline,
  capture: RawCapture,
  fileId: string,
  subdir: 'images' | 'audio',
  fallbackExt: string,
): Promise<void> {
  try {
    const file = await ctx.api.getFile(fileId);
    const ext = path.extname(file.file_path || fallbackExt) || fallbackExt;
    const filePath = await downloadTelegramFile(file.file_path!, capture.id, subdir, ext);

    if (subdir === 'images') {
      capture.imagePath = filePath;
      db.updateMediaPath(capture.id, 'image_path', filePath);
    } else {
      capture.audioPath = filePath;
      db.updateMediaPath(capture.id, 'audio_path', filePath);
    }

    pipeline.enqueue(capture);
  } catch (error: any) {
    console.error(`[Bot] Background download failed for ${capture.id}:`, error.message);
    db.markFailed(capture.id, `Download failed: ${error.message}`);
    // No reply sent here — the ✅ ack already went out. The row is
    // marked 'failed' and will surface in /stats and get a real
    // second attempt via /retry.
  }
}
