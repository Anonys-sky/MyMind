export interface Capture {
  id: string;
  raw_content: string | null;
  raw_type: 'text' | 'image' | 'audio' | 'document';
  title: string | null;
  summary: string | null;
  key_insights: string | null; // JSON string in DB, but let's parse it
  tags: string | null; // JSON string
  category: string | null;
  action_items: string | null; // JSON string
  image_path: string | null;
  audio_path: string | null;
  source_url: string | null;
  caption: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'deleted';
  created_at: string;
  processed_at: string | null;
}

export interface SearchResult {
  capture: Capture;
  score: number;
  matchType: 'semantic' | 'keyword' | 'hybrid';
}

export interface Stats {
  total: number;
  pending: number;
  failed: number;
  byCategory: Record<string, number>;
  byType: Record<string, number>;
  thisWeek: number;
}
