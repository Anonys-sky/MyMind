# 🧠 MyMind

**Zero-friction personal knowledge capture & retrieval system.**

Dump your thoughts, voice memos, screenshots, and bookmarks into a Telegram bot. AI processes everything into structured, searchable knowledge. Zero organization required.

**Status: v1 Complete** (All core specification phases implemented)

## Features

- **Instant Capture:** Forward reels, screenshots, or voice memos to the Telegram bot and get an instant acknowledgment. No app-switching required.
- **Smart Processing:** AI automatically transcribes audio (Whisper), extracts text and meaning from images (Vision API), and tags/categorizes content automatically.
- **Deduplication & Compression:** Images are resized to save space, and perceptual hashing ensures you never save the same screenshot twice.
- **Resurfacing:** Use `/digest` in the bot to get a curated list of forgotten items untouched for 30+ days.
- **Web Interface (PWA):** A phone-first, ultra-premium dark mode Progressive Web App.
  - **List View:** Masonry grid layout with category-coded glowing chips.
  - **Explore Mode:** A 3D interactive neural graph built with `three.js`. Navigate your second brain by AI-calculated semantic similarity.

## How It Works

```
You (Telegram) → Bot captures → AI processes → Stored & searchable
     ↑                                              ↓
  Send anything                              Search & retrieve
  (text, voice,                              (Semantic search,
   photos, links)                             3D Neural Graph,
                                              Web UI)
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

The system consists of two parts: the Node.js backend (Bot + API) and the Vite React frontend.

**Start the Backend:**
```bash
npm install
npm run dev
```

**Start the Web UI:**
```bash
cd web
npm install
npm run dev
```

The Web UI will be available at `http://localhost:5173`. You can also install it as an iOS/Android PWA!

### 4. Start Capturing

Open Telegram and send anything to your bot:
- 📝 **Text** — quick thoughts, ideas, notes
- 🎤 **Voice** — ramble freely, AI transcribes & structures it
- 📸 **Photos** — screenshots, whiteboards, designs
- 🔗 **Links** — articles, posts, resources
- ↩️ **Forwards** — messages from other chats

The bot replies with ✅ instantly. AI processing happens in the background.

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and usage guide |
| `/stats` | View knowledge base statistics |
| `/search <query>` | Hybrid semantic + keyword search |
| `/tag <id> <tags>`| Quick-fix incorrect tags |
| `/recent` | Show last 5 captures |
| `/digest` | Resurface 5 forgotten items (30+ days old) |
| `/retry` | Re-process any failed captures |

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Bot | [grammy](https://grammy.dev/) | Lightweight, TypeScript-first Telegram bot framework |
| Web UI | React + Vite + PWA | Phone-first UI, Masonry grid, 3D Neural Graph |
| AI Processing | [Groq](https://groq.com/) (free tier) | Llama 3.3 70B for text, Whisper for audio, Llama Vision for images |
| Embeddings | [@xenova/transformers](https://github.com/xenova/transformers.js) | Local 384-dim embeddings, zero API calls |
| Database | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) | SQLite with FTS5 full-text search |
| Search | Cosine similarity + FTS5 | Hybrid semantic + keyword search |

## Architecture

**Capture** → The Telegram bot accepts any message type and immediately saves the raw data to SQLite. It responds with ✅ in milliseconds.

**Process** → A serial queue processes captures asynchronously (500ms intervals to respect API limits):
- Images compressed and hash-deduplicated (Sharp)
- Voice → Groq Whisper transcription
- Photos → Groq Vision OCR + distinct AI notes
- All → Groq LLM structures into title, summary, tags, category
- All → Local embedding generation (384-dim vectors)

**Store** → Processed content + embeddings saved to SQLite. FTS5 index updated for keyword search.

**Search & Graph** → Hybrid search combining semantic (cosine similarity) and FTS5 keyword search. The 3D graph calculates semantic edges on the fly for exploration mode.

## License

Private project.
