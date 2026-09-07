// ═══════════════════════════════════════════════════════════
// Content Structurer — Groq LLM (Llama 3.3 70B)
// ═══════════════════════════════════════════════════════════
//
// The core brain of MyMind. Takes raw, messy input (voice
// transcripts, OCR text, quick notes) and transforms it into
// structured, searchable knowledge entries.

import Groq from 'groq-sdk';
import { config } from '../config.js';
import { ProcessedCapture, CaptureCategory } from '../types.js';

const groq = new Groq({ apiKey: config.groq.apiKey });

const VALID_CATEGORIES: CaptureCategory[] = [
  'idea', 'reference', 'task', 'quote', 'link', 'learning', 'other',
];

const SYSTEM_PROMPT = `You are a ruthless, highly efficient executive assistant to a CEO. Your job is to process raw, unstructured input (voice transcripts, hasty texts, forwarded links) and extract ONLY the absolute core signal.

Your task:
1. **core_insight**: A single, punchy sentence that captures the exact technical or strategic essence of the input. Do not use fluff.
2. **tags**: Generate 3-5 semantic tags (lowercase, hyphenated) for backend vector clustering ONLY.
3. **category**: Classify into exactly ONE category:
   - "idea", "reference", "task", "quote", "link", "learning", "other"
4. **actionable_directives**: An array of specific, imperative tasks. NEVER repeat the core_insight. If the user input is a vague idea like "Build an AI agent", generate one highly specific, immediate technical next step (e.g., "Initialize Next.js repository" or "Define target use-case"). If there is no action, return [].

Return ONLY valid JSON in this exact format:
{
  "core_insight": "...",
  "tags": ["...", "..."],
  "category": "idea|reference|task|quote|link|learning|other",
  "actionable_directives": ["...", "..."]
}

Rules:
- NEVER summarize or repeat the original text. We already have it.
- Action items MUST be imperative ("Do X", "Write Y") and highly specific.
- Even very short input (< 5 words) gets processed.`;

/**
 * Process raw content through the LLM to produce structured knowledge.
 *
 * @param rawContent - The raw text to structure (transcript, OCR, note, etc.)
 * @param contentType - The source type for context (voice, photo, text, etc.)
 * @param caption - Optional caption from a photo/document message
 * @returns Structured capture with title, summary, tags, category, etc.
 */
export async function structureContent(
  rawContent: string,
  contentType: string,
  caption?: string | null,
): Promise<ProcessedCapture> {
  console.log(`[Structurer] Processing ${contentType} (${rawContent.length} chars)`);

  const contextNote = caption
    ? `\n\nThe user also provided this caption with the content: "${caption}"`
    : '';

  try {
    const response = await groq.chat.completions.create({
      model: config.groq.textModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Content type: ${contentType}${contextNote}\n\nRaw content:\n${rawContent}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 400,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from Groq structurer');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error(`Failed to parse structurer JSON: ${content.substring(0, 200)}`);
    }

    // Validate and normalize the response
    const result: ProcessedCapture = {
      title: typeof parsed.core_insight === 'string' && parsed.core_insight.trim().length > 0 
        ? parsed.core_insight.trim() 
        : rawContent.trim().split('\n')[0].substring(0, 80),
      summary: '',
      keyInsights: [],
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter(Boolean).map(String) : [],
      category: VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'other',
      actionItems: Array.isArray(parsed.actionable_directives) ? parsed.actionable_directives.filter(Boolean) : [],
    };

    console.log(
      `[Structurer] ✅ "${result.title}" [${result.category}] ` +
      `tags: [${result.tags.join(', ')}]`,
    );

    return result;
  } catch (err: any) {
    console.warn(`[Structurer] Warning: Groq call failed (${err.message}). Using resilient fallback.`);
    // Fallback: don't let API failures drop the capture
    const fallbackTitle = rawContent.trim().split('\n')[0].substring(0, 80) || 'Capture';
    return {
      title: fallbackTitle,
      summary: '',
      keyInsights: [],
      tags: [contentType],
      category: 'other',
      actionItems: [],
    };
  }
}
