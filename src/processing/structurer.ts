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

const SYSTEM_PROMPT = `You are an executive knowledge assistant. Your job is to process raw, unstructured input from a busy professional and transform it into a clean, structured knowledge entry.

The input may be:
- A rambling voice memo transcript (possibly with grammar errors, incomplete sentences, mixed languages including English and Malay)
- Raw text typed hastily on a phone
- OCR text extracted from a screenshot
- A description of an image, design, or UI
- Content from a forwarded message or link
- A short one-line thought or idea

Your task:
1. **title**: A concise, descriptive title (max 10 words) that captures the essence
2. **summary**: Clean up the content into clear, readable Markdown. Preserve ALL original meaning but make it well-structured. Add formatting (bullets, headers) where appropriate.
3. **key_insights**: Extract 2-5 key insights or takeaways as concise bullet points
4. **tags**: Generate 3-5 semantic tags (lowercase, hyphenated phrases like "backend-architecture", "leadership-advice", "css-trick", "event-planning")
5. **category**: Classify into exactly ONE category:
   - "idea" — a new concept, thought, or creative insight
   - "reference" — technical info, documentation, how-to, tutorial content
   - "task" — something that needs to be done, an action item
   - "quote" — a memorable quote or advice from someone
   - "link" — a URL or article reference
   - "learning" — something learned at an event, from a person, or through experience
   - "other" — doesn't fit the above categories
6. **action_items**: Extract specific things the person needs to DO (empty array if none)

Return ONLY valid JSON in this exact format:
{
  "title": "...",
  "summary": "...",
  "key_insights": ["...", "..."],
  "tags": ["...", "..."],
  "category": "idea|reference|task|quote|link|learning|other",
  "action_items": ["...", "..."]
}

Rules:
- Preserve the original meaning and intent COMPLETELY — do NOT omit details
- If the input mixes languages, keep the summary in the dominant language but tags always in English
- Do NOT add information that wasn't in the original input
- Even very short input (< 10 words) should get appropriate title, tags, and category
- action_items should be [] if none are mentioned
- The summary is a CLEANED version of the content, not a meta-description about it`;

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
    max_tokens: 2000,
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
    title: typeof parsed.title === 'string' ? parsed.title : 'Untitled',
    summary: typeof parsed.summary === 'string' ? parsed.summary : rawContent,
    keyInsights: Array.isArray(parsed.key_insights) ? parsed.key_insights.filter(Boolean) : [],
    tags: Array.isArray(parsed.tags) ? parsed.tags.filter(Boolean).map(String) : [],
    category: VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'other',
    actionItems: Array.isArray(parsed.action_items) ? parsed.action_items.filter(Boolean) : [],
  };

  console.log(
    `[Structurer] ✅ "${result.title}" [${result.category}] ` +
    `tags: [${result.tags.join(', ')}]`,
  );

  return result;
}
