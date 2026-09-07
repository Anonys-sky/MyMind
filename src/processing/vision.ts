// ═══════════════════════════════════════════════════════════
// Image Analysis — Groq Vision (Llama 3.2 Vision)
// ═══════════════════════════════════════════════════════════
//
// Analyzes screenshots, photos, and documents using Groq's
// Vision LLM. Extracts OCR text, describes visual content,
// and captures technical details from code/UI screenshots.

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
 * Analyze an image using Groq's Vision model.
 * Extracts text (OCR), describes visual content, and captures
 * technical details from screenshots and documents.
 *
 * @param imagePath - Path to the image file
 * @returns Comprehensive text description of the image
 */
export async function analyzeImage(imagePath: string): Promise<string> {
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
            text: `You are a knowledge extraction assistant. Analyze this image thoroughly and provide:

1. **Text Content (OCR)**: Transcribe ALL text visible in the image exactly as written. Include code, labels, headings, captions, error messages — everything.

2. **Visual Description**: Describe what the image shows — is it a screenshot, photo, diagram, whiteboard, social media post, etc.?

3. **Technical Content**: If the image contains code, UI elements, architecture diagrams, terminal output, or documentation, describe the technical concepts in detail.

4. **Key Information**: What are the most important takeaways someone would want to remember from this image?

Combine everything into a single comprehensive text. Focus on capturing ALL useful information for future retrieval.`,
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
    max_tokens: 2000,
    temperature: 0.2,
  });

  const description = response.choices[0]?.message?.content || 'Unable to analyze image';
  console.log(`[Vision] Done (${description.length} chars)`);
  return description;
}
