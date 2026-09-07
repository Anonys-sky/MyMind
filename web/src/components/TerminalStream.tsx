import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Image as ImageIcon, Mic, FileText, Code2, Trash2, Trash } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Capture } from '../types';

interface TerminalStreamProps {
  captures: Capture[];
  onDelete: (id: string) => void;
  apiBaseUrl: string;
}

export const TerminalStream: React.FC<TerminalStreamProps> = ({ captures, onDelete, apiBaseUrl }) => {
  if (captures.length === 0) {
    return (
      <div className="empty-state">
        <p className="terminal-dim">No signals captured. Waiting for input...</p>
      </div>
    );
  }

  const getTypeIcon = (capture: Capture) => {
    // If tags indicate code, use Code2 icon
    const hasCode = capture.tags?.includes('code') || capture.tags?.includes('typescript') || capture.tags?.includes('python');
    if (hasCode) return <Code2 size={14} className="type-icon" />;

    switch (capture.raw_type) {
      case 'image': return <ImageIcon size={14} className="type-icon" />;
      case 'audio': return <Mic size={14} className="type-icon" />;
      default: return <FileText size={14} className="type-icon" />;
    }
  };

  return (
    <div className="terminal-stream">
      <AnimatePresence>
        {captures.map((capture) => (
          <motion.div
            key={capture.id}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, margin: 0 }}
            className="terminal-entry"
          >
            {/* Header: Timestamp + Icon */}
            <div className="entry-header">
              <span className="entry-icon">{getTypeIcon(capture)}</span>
              <span className="entry-time">
                {formatDistanceToNow(new Date(capture.created_at), { addSuffix: true })}
              </span>
              <button onClick={() => onDelete(capture.id)} className="entry-delete" title="Delete">
                <Trash size={12} />
              </button>
            </div>

            {/* Media if present */}
            {capture.raw_type === 'image' && capture.image_path && (
              <div className="entry-media">
                <img src={`${apiBaseUrl}/images/${capture.image_path.split('/').pop()}`} alt="Capture" />
              </div>
            )}
            
            {capture.raw_type === 'audio' && capture.audio_path && (
              <div className="entry-media">
                <audio controls className="custom-audio">
                  <source src={`${apiBaseUrl}/audio/${capture.audio_path.split('/').pop()}`} type="audio/ogg" />
                </audio>
              </div>
            )}

            {/* Raw Input */}
            <div className="entry-raw">
              {capture.raw_content || capture.summary || 'No content provided.'}
            </div>

            {/* AI Distillation (Core Thesis) */}
            <div className="entry-distillation">
              {capture.title}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
