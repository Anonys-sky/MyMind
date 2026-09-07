// ═══════════════════════════════════════════════════════════
// Audio Transcription — Groq Whisper
// ═══════════════════════════════════════════════════════════
//
// Transcribes voice memos using Groq's Whisper API.
// Handles multilingual audio (English, Malay, mixed).
// Free tier: 14,400 requests/day.

import Groq from 'groq-sdk';
import { config } from '../config.js';
import fs from 'fs';

const groq = new Groq({ apiKey: config.groq.apiKey });

/**
 * Transcribe an audio file to text using Groq's Whisper model.
 *
 * @param audioPath - Path to the OGG/audio file from Telegram
 * @returns The transcribed text
 */
export async function transcribeAudio(audioPath: string): Promise<string> {
  console.log(`[Transcriber] Transcribing: ${audioPath}`);

  const fileStream = fs.createReadStream(audioPath);

  const transcription = await groq.audio.transcriptions.create({
    file: fileStream,
    model: config.groq.whisperModel,
    // Don't set language — let Whisper auto-detect
    // This handles mixed English/Malay seamlessly
  });

  const text = transcription.text.trim();
  console.log(`[Transcriber] Done (${text.length} chars): "${text.substring(0, 80)}..."`);
  return text;
}
