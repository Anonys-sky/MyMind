# 🧠 MyMind

**Zero-friction personal knowledge capture & retrieval system.**

Dump your thoughts, voice memos, screenshots, and bookmarks into a Telegram bot. AI processes everything into structured, searchable knowledge. Zero organization required.

## How It Works

```
You (Telegram) → Bot captures → AI processes → Stored & searchable
     ↑                                              ↓
  Send anything                              Search & retrieve
  (text, voice,                              (semantic search,
   photos, links)                             keyword search,
                                              AI chat Q&A)
```

## Quick Start

### 1. Get Your API Keys

**Telegram Bot Token** (2 minutes):
1. Open Telegram, search for `@BotFather`
2. Send `/newbot`
3. Choose a name (e.g., "MyMind")
4. Choose a username (e.g., `mymind_brain_bot`)
5. Copy the bot token

**Your Telegram User ID** (30 seconds):
1. Open Telegram, search for `@userinfobot`
2. Send any message to it
3. It replies with your User ID — copy it

**Groq API Key** (1 minute):
1. Go to [console.groq.com/keys](https://console.groq.com/keys)
2. Sign up (free, no credit card)
3. Create a new API key — copy it

### 2. Configure

```bash
# Copy the template
cp .env.example .env

# Edit .env and paste your keys:
# TELEGRAM_BOT_TOKEN=your_bot_token
# TELEGRAM_USER_ID=your_user_id
# GROQ_API_KEY=your_groq_key
```

### 3. Install & Run

```bash
npm install
npm run dev
```

### 4. Start Capturing

Open Telegram and send anything to your bot:
- 📝 **Text** — quick thoughts, ideas, notes
- 🎤 **Voice** — ramble freely, AI transcribes & structures it
- 📸 **Photos** — screenshots, whiteboards, designs
- 🔗 **Links** — articles, posts, resources
- ↩️ **Forwards** — messages from other chats
- 📎 **Files** — documents with useful content

The bot replies with ✅ instantly. AI processing happens in the background.

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and usage guide |
| `/stats` | View knowledge base statistics |
| `/recent` | Show last 5 captures |
| `/retry` | Re-process any failed captures |

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Bot | [grammy](https://grammy.dev/) | Lightweight, TypeScript-first Telegram bot framework |
| AI Processing | [Groq](https://groq.com/) (free tier) | Llama 3.3 70B for text, Whisper for audio, Llama Vision for images |
| Embeddings | [@xenova/transformers](https://github.com/xenova/transformers.js) | Local 384-dim embeddings, zero API calls |
| Database | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | SQLite with FTS5 full-text search |
| Search | Cosine similarity + FTS5 | Hybrid semantic + keyword search |

## Project Structure

```
MyMind/
├── src/
│   ├── index.ts              # Entry point
│   ├── config.ts             # Environment config
│   ├── types.ts              # TypeScript type definitions
│   ├── bot/
│   │   └── index.ts          # Telegram bot handlers
│   ├── processing/
│   │   ├── index.ts          # Processing pipeline coordinator
│   │   ├── transcriber.ts    # Groq Whisper audio transcription
│   │   ├── vision.ts         # Groq Vision image analysis
│   │   ├── structurer.ts     # Groq LLM content structuring
│   │   └── embedder.ts       # Local embedding generation
│   └── storage/
│       ├── database.ts       # SQLite operations
│       └── search.ts         # Hybrid search engine
├── data/                     # Runtime data (gitignored)
│   ├── mymind.db             # SQLite database
│   ├── images/               # Saved photos & screenshots
│   └── audio/                # Saved voice memos
├── package.json
├── tsconfig.json
├── .env                      # Your API keys (gitignored)
└── .env.example              # Template
```

## Architecture

**Capture** → The Telegram bot accepts any message type and immediately saves the raw data to SQLite. It responds with ✅ in milliseconds.

**Process** → A serial queue processes captures asynchronously:
- Voice → Groq Whisper transcription
- Photos → Groq Vision OCR + description
- Text → direct processing
- All → Groq LLM structures into title, summary, tags, category
- All → Local embedding generation (384-dim vectors)

**Store** → Processed content + embeddings saved to SQLite. FTS5 index updated for keyword search.

**Search** → Hybrid search combining:
- Semantic search (cosine similarity over embeddings)
- Keyword search (SQLite FTS5)
- Items matching both rank highest

## License

Private project.
