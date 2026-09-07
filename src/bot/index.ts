// ═══════════════════════════════════════════════════════════
// Telegram Bot — The Capture Interface
// ═══════════════════════════════════════════════════════════
//
// This is the ONLY input interface. You send messages to this
// bot from your phone or desktop Telegram — text, voice, photos,
// links, forwards — and it captures everything instantly.
//
// The bot responds with ✅ in <100ms. All AI processing happens
// asynchronously in the background. You never wait.

import { Bot, Context } from 'grammy';
import { config } from '../config.js';
import { RawCapture } from '../types.js';
import { ProcessingPipeline } from '../processing/index.js';
import { CaptureDatabase } from '../storage/database.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';

/**
 * Create and configure the Telegram bot with all message handlers.
 */
export function createBot(db: CaptureDatabase, pipeline: ProcessingPipeline): Bot {
  const bot = new Bot(config.telegram.botToken);

  // ── Security middleware: only accept from authorized user ──
  bot.use(async (ctx, next) => {
    if (ctx.from?.id !== config.telegram.allowedUserId) {
      // Silently ignore unauthorized users
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
      `/stats — View your knowledge base statistics\n` +
      `/recent — Show last 5 captures\n` +
      `/retry — Re-process any failed captures`,
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
  bot.command('recent', async (ctx) => {
    const recent = db.getRecent(5);
    if (recent.length === 0) {
      await ctx.reply('No captures yet. Send me something!');
      return;
    }

    const lines = recent.map((c, i) => {
      const tags = c.tags ? JSON.parse(c.tags).join(', ') : '';
      const date = new Date(c.created_at + 'Z').toLocaleDateString();
      return `${i + 1}. *${c.title || 'Untitled'}*\n   ${c.category || 'other'} • ${date}\n   ${tags}`;
    });

    await ctx.reply(
      `📋 *Recent Captures*\n\n${lines.join('\n\n')}`,
      { parse_mode: 'Markdown' },
    );
  });

  // ── /retry command ────────────────────────────────────────
  bot.command('retry', async (ctx) => {
    const count = await pipeline.retryFailed();
    if (count === 0) {
      await ctx.reply('✅ No failed captures to retry.');
    } else {
      await ctx.reply(`🔄 Retrying ${count} failed capture(s)...`);
    }
  });

  // ── Text messages ─────────────────────────────────────────
  bot.on('message:text', async (ctx) => {
    // Skip commands (already handled above)
    if (ctx.message.text.startsWith('/')) return;

    const capture = newCapture(ctx, 'text');
    capture.rawContent = ctx.message.text;

    // Detect if the message is primarily a URL
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
  bot.on('message:voice', async (ctx) => {
    const capture = newCapture(ctx, 'voice');

    try {
      const file = await ctx.getFile();
      const filePath = await downloadTelegramFile(
        file.file_path!, capture.id, 'audio', '.ogg',
      );
      capture.audioPath = filePath;
      capture.telegramFileId = file.file_id;

      db.insertRaw(capture);
      await ctx.reply('✅ 🎤');
      pipeline.enqueue(capture);
    } catch (error: any) {
      console.error('[Bot] Failed to download voice:', error.message);
      await ctx.reply('❌ Failed to capture voice memo. Try again?');
    }
  });

  // ── Audio files (MP3 etc. sent as audio) ──────────────────
  bot.on('message:audio', async (ctx) => {
    const capture = newCapture(ctx, 'voice');

    try {
      const file = await ctx.getFile();
      const ext = path.extname(ctx.message.audio.file_name || '.mp3') || '.mp3';
      const filePath = await downloadTelegramFile(
        file.file_path!, capture.id, 'audio', ext,
      );
      capture.audioPath = filePath;
      capture.telegramFileId = file.file_id;
      capture.caption = ctx.message.caption || null;

      db.insertRaw(capture);
      await ctx.reply('✅ 🎵');
      pipeline.enqueue(capture);
    } catch (error: any) {
      console.error('[Bot] Failed to download audio:', error.message);
      await ctx.reply('❌ Failed to capture audio. Try again?');
    }
  });

  // ── Photos ────────────────────────────────────────────────
  bot.on('message:photo', async (ctx) => {
    const capture = newCapture(ctx, 'photo');

    try {
      // Get the highest resolution version
      const photos = ctx.message.photo;
      const largest = photos[photos.length - 1];
      const file = await ctx.api.getFile(largest.file_id);
      const ext = path.extname(file.file_path || '.jpg') || '.jpg';

      const filePath = await downloadTelegramFile(
        file.file_path!, capture.id, 'images', ext,
      );
      capture.imagePath = filePath;
      capture.caption = ctx.message.caption || null;
      capture.telegramFileId = file.file_id;

      db.insertRaw(capture);
      await ctx.reply('✅ 📸');
      pipeline.enqueue(capture);
    } catch (error: any) {
      console.error('[Bot] Failed to download photo:', error.message);
      await ctx.reply('❌ Failed to capture photo. Try again?');
    }
  });

  // ── Documents ─────────────────────────────────────────────
  bot.on('message:document', async (ctx) => {
    const doc = ctx.message.document;
    const mime = doc.mime_type || '';
    const capture = newCapture(ctx, 'document');
    capture.caption = ctx.message.caption || null;

    try {
      // Handle image documents (sent as files instead of photos)
      if (mime.startsWith('image/')) {
        const file = await ctx.getFile();
        const ext = path.extname(doc.file_name || '.jpg') || '.jpg';
        const filePath = await downloadTelegramFile(
          file.file_path!, capture.id, 'images', ext,
        );
        capture.imagePath = filePath;
        capture.rawType = 'photo';
        capture.telegramFileId = file.file_id;

        db.insertRaw(capture);
        await ctx.reply('✅ 📸');
        pipeline.enqueue(capture);
        return;
      }

      // Handle text/code documents
      const textExtensions = ['.txt', '.md', '.json', '.csv', '.js', '.ts', '.py', '.html', '.css', '.yaml', '.yml', '.xml', '.log'];
      const ext = path.extname(doc.file_name || '').toLowerCase();
      const isTextFile = mime.startsWith('text/') || mime === 'application/json' || textExtensions.includes(ext);

      if (isTextFile && (doc.file_size || 0) < 1024 * 1024) { // < 1MB
        const file = await ctx.getFile();
        if (file.file_path) {
          const url = `https://api.telegram.org/file/bot${config.telegram.botToken}/${file.file_path}`;
          const res = await fetch(url);
          if (res.ok) {
            const fileText = await res.text();
            capture.rawContent = fileText.substring(0, 20000); // cap at 20k chars
            capture.rawType = 'text';
            capture.caption = doc.file_name || null;
            db.insertRaw(capture);
            await ctx.reply('✅ 📎');
            pipeline.enqueue(capture);
            return;
          }
        }
      }

      // For other documents, capture metadata
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

    try {
      const file = await ctx.getFile();
      const filePath = await downloadTelegramFile(
        file.file_path!, capture.id, 'audio', '.mp4',
      );
      capture.audioPath = filePath;
      capture.telegramFileId = file.file_id;

      db.insertRaw(capture);
      await ctx.reply('✅ 🎥');
      pipeline.enqueue(capture);
    } catch (error: any) {
      console.error('[Bot] Failed to download video note:', error.message);
      await ctx.reply('❌ Failed to capture video note. Try again?');
    }
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

/**
 * Create a new RawCapture shell with common fields from context.
 */
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
 * Download a file from Telegram's servers to local storage.
 */
async function downloadTelegramFile(
  telegramFilePath: string,
  captureId: string,
  subdir: 'images' | 'audio',
  ext: string,
): Promise<string> {
  const url = `https://api.telegram.org/file/bot${config.telegram.botToken}/${telegramFilePath}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const dir = subdir === 'images' ? config.storage.imagesDir : config.storage.audioDir;
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${captureId}${ext}`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);

  console.log(`[Bot] Downloaded: ${filePath} (${formatBytes(buffer.length)})`);
  return filePath;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
