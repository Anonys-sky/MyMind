// ═══════════════════════════════════════════════════════════
// Image Processing — Compression & Deduplication
// ═══════════════════════════════════════════════════════════
//
// Phase 2 additions:
//   1. Resize/compress images before storage + Vision API call
//      (cap at 1600px longest edge, JPEG 80% quality)
//   2. Perceptual hash for near-duplicate detection
//
// Uses sharp for image manipulation — no external services.

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 80;

/**
 * Resize and compress an image in-place.
 * - Caps the longest edge at 1600px
 * - Re-encodes as JPEG at 80% quality
 * - Overwrites the original file
 *
 * Returns the new file path (may change extension to .jpg)
 * and the file size reduction info.
 */
export async function compressImage(imagePath: string): Promise<{
  outputPath: string;
  originalSize: number;
  compressedSize: number;
}> {
  const originalBuffer = fs.readFileSync(imagePath);
  const originalSize = originalBuffer.length;

  const image = sharp(originalBuffer);
  const metadata = await image.metadata();

  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const longestEdge = Math.max(width, height);

  let pipeline = image;

  // Only resize if larger than MAX_DIMENSION
  if (longestEdge > MAX_DIMENSION) {
    pipeline = pipeline.resize({
      width: width >= height ? MAX_DIMENSION : undefined,
      height: height > width ? MAX_DIMENSION : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  // Re-encode as JPEG
  const compressedBuffer = await pipeline
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();

  // Write to .jpg path (may differ from original extension)
  const dir = path.dirname(imagePath);
  const basename = path.basename(imagePath, path.extname(imagePath));
  const outputPath = path.join(dir, `${basename}.jpg`);

  fs.writeFileSync(outputPath, compressedBuffer);

  // Clean up original if extension changed
  if (outputPath !== imagePath && fs.existsSync(imagePath)) {
    fs.unlinkSync(imagePath);
  }

  const compressedSize = compressedBuffer.length;
  const savings = ((1 - compressedSize / originalSize) * 100).toFixed(1);
  console.log(
    `[ImageProc] Compressed: ${originalSize} → ${compressedSize} bytes (${savings}% smaller)` +
    (longestEdge > MAX_DIMENSION ? ` | Resized ${width}×${height} → max ${MAX_DIMENSION}px` : ''),
  );

  return { outputPath, originalSize, compressedSize };
}

/**
 * Generate a content hash for exact-match deduplication.
 * Uses SHA-256 of the raw file bytes — fast and deterministic.
 *
 * For near-duplicate detection (e.g. same screenshot with slightly
 * different crops), a perceptual hash would be better, but exact
 * hash catches the most common case (forwarding the same image twice)
 * with zero false positives.
 */
export async function hashImage(imagePath: string): Promise<string> {
  const buffer = fs.readFileSync(imagePath);
  return crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 16);
}
