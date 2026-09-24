// ═══════════════════════════════════════════════════════════
// Image Analysis — Groq Vision (Llama 4 Scout)
// ═══════════════════════════════════════════════════════════
//
// Phase 2 rewrite: Returns structured output with OCR text and
// AI interpretation as SEPARATE fields, never blended into one
// searchable blob. This eliminates the hallucination-adjacent
// risk where Vision model interpretations were stored as if they
// were literal text transcriptions.

import Groq from 'groq-sdk';
import { config } from '../config.js';
import fs from 'fs';
import path from 'path';

const groq = new Groq({ apiKey: config.groq.apiKey });

/** Map file extensions to MIME types */
const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

/**
 * Structured output from vision analysis.
 * OCR text and AI interpretation are kept separate so they can
 * be stored in distinct database columns and searched independently.
 */
export interface VisionResult {
  /** Literal text transcription from the image (OCR). Verbatim, no interpretation. */
  ocrText: string;
  /** AI's interpretive description of visual content, context, and key takeaways. */
  aiNotes: string;
}

/**
 * Analyze an image using Groq's Vision model.
 * Returns structured output with OCR and AI notes separated.
 *
 * @param imagePath - Path to the image file
 * @returns Structured vision result with separate OCR and AI fields
 */
export async function analyzeImage(imagePath: string): Promise<VisionResult> {
  console.log(`[Vision] Analyzing: ${imagePath}`);

  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'image/jpeg';

  const response = await groq.chat.completions.create({
    model: config.groq.visionModel,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Analyze this image and respond in EXACTLY this JSON format:

{
  "ocr_text": "ALL text visible in the image, transcribed exactly as written — every word, label, heading, code snippet, error message, URL, caption. If no text is visible, use an empty string.",
  "ai_notes": "Your interpretation: what the image shows (screenshot, photo, diagram, etc.), technical context if any, and the most important takeaways someone would want to remember."
}

CRITICAL RULES:
- ocr_text must be VERBATIM transcription only. Do not add, interpret, or rephrase any text.
- ai_notes is for YOUR interpretation and context — describe, don't transcribe.
- Return ONLY valid JSON, nothing else.`,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    max_tokens: 800,
    temperature: 0.1,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content || '';
  console.log(`[Vision] Raw response (${content.length} chars)`);

  try {
    const parsed = JSON.parse(content);
    const result: VisionResult = {
      ocrText: typeof parsed.ocr_text === 'string' ? parsed.ocr_text.trim() : '',
      aiNotes: typeof parsed.ai_notes === 'string' ? parsed.ai_notes.trim() : content.trim(),
    };

    console.log(
      `[Vision] ✅ OCR: ${result.ocrText.length} chars | Notes: ${result.aiNotes.length} chars`,
    );
    return result;
  } catch {
    // If JSON parsing fails, treat entire output as ai_notes (safe fallback)
    console.warn('[Vision] Failed to parse structured response, using fallback');
    return {
      ocrText: '',
      aiNotes: content.trim() || 'Unable to analyze image',
    };
  }
}
