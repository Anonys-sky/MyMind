import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`\n❌ Missing required environment variable: ${name}`);
    console.error(`   Copy .env.example to .env and fill in your values.\n`);
    process.exit(1);
  }
  return value;
}

export const config = {
  telegram: {
    botToken: requireEnv('TELEGRAM_BOT_TOKEN'),
    allowedUserId: parseInt(requireEnv('TELEGRAM_USER_ID'), 10),
  },
  groq: {
    apiKey: requireEnv('GROQ_API_KEY'),
    textModel: 'openai/gpt-oss-120b',
    visionModel: 'qwen/qwen3.8-27b',
    whisperModel: 'whisper-large-v3-turbo',
  },
  storage: {
    dbPath: process.env.DB_PATH || path.join(projectRoot, 'data', 'mymind.db'),
    imagesDir: process.env.IMAGES_DIR || path.join(projectRoot, 'data', 'images'),
    audioDir: process.env.AUDIO_DIR || path.join(projectRoot, 'data', 'audio'),
  },
  embedding: {
    model: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384,
  },
  api: {
    port: parseInt(process.env.PORT || '3001', 10),
    authToken: process.env.API_AUTH_TOKEN || 'mymind-dev-token',
  },
} as const;
