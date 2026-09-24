import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Image as ImageIcon, Mic, FileText, Trash2, Link } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Capture } from '../types';

interface MasonryFeedProps {
  captures: Capture[];
  onDelete: (id: string) => void;
  apiBaseUrl: string;
}

export const MasonryFeed: React.FC<MasonryFeedProps> = ({ captures, onDelete, apiBaseUrl }) => {
  if (captures.length === 0) {
    return (
      <div className="empty-state">
        <p className="terminal-dim">No signals captured. Waiting for input...</p>
      </div>
    );
  }

  const getTypeIcon = (capture: Capture) => {
    const type = (capture.raw_type || '').toLowerCase();
    switch (type) {
      case 'image':
      case 'photo':
        return <ImageIcon size={14} className="type-icon" />;
      case 'audio':
      case 'voice':
        return <Mic size={14} className="type-icon" />;
      case 'link':
        return <Link size={14} className="type-icon" />;
      default:
        return <FileText size={14} className="type-icon" />;
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr.endsWith('Z') ? dateStr : dateStr + 'Z');
      if (isNaN(d.getTime())) return dateStr;
      return formatDistanceToNow(d, { addSuffix: true });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="masonry-feed">
      <AnimatePresence>
        {captures.map((capture) => {
          const isImage = (capture.raw_type === 'image' || capture.raw_type === 'photo') && capture.image_path;
          const imageFileName = isImage ? capture.image_path!.split(/[/\\]/).pop() : null;
          
          let tags: string[] = [];
          try {
             tags = capture.tags ? JSON.parse(capture.tags) : [];
          } catch(e) {}

          const catClass = capture.category ? `cat-${capture.category}` : 'cat-other';

          return (
            <motion.div
              key={capture.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="masonry-card"
            >
              {/* Media if present - Image First */}
              {isImage && imageFileName && (
                <div className="card-media">
                  <img src={`${apiBaseUrl}/images/${imageFileName}`} alt="Capture" loading="lazy" />
                </div>
              )}
              
              <div className="card-content">
                <div className="card-header">
                  <div className={`category-chip ${catClass}`}>
                    {capture.category || 'other'}
                  </div>
                  <button onClick={() => onDelete(capture.id)} className="card-delete" title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>

                <h3 className="card-title">{capture.title || 'Untitled'}</h3>
                
                <div className="card-body">
                  {capture.summary || capture.raw_content || 'No content.'}
                </div>

                <div className="card-footer">
                  <div className="card-tags">
                    {tags.slice(0, 3).map((tag: string, i: number) => (
                      <span key={i} className="tag">#{tag}</span>
                    ))}
                    {tags.length > 3 && <span className="tag">+{tags.length - 3}</span>}
                  </div>
                  <div className="card-meta">
                    {getTypeIcon(capture)}
                    <span>{formatTime(capture.created_at)}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
