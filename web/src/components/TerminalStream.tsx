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
    const hasCode = capture.tags?.includes('code') || capture.tags?.includes('typescript') || capture.tags?.includes('python');
    if (hasCode) return <Code2 size={14} className="type-icon" />;

    const type = (capture.raw_type || '').toLowerCase();
    switch (type) {
      case 'image':
      case 'photo':
        return <ImageIcon size={14} className="type-icon" />;
      case 'audio':
      case 'voice':
        return <Mic size={14} className="type-icon" />;
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
    <div className="terminal-stream">
      <AnimatePresence>
        {captures.map((capture) => {
          const isImage = (capture.raw_type === 'image' || capture.raw_type === 'photo') && capture.image_path;
          const isAudio = (capture.raw_type === 'audio' || capture.raw_type === 'voice') && capture.audio_path;
          const imageFileName = isImage ? capture.image_path!.split(/[/\\]/).pop() : null;
          const audioFileName = isAudio ? capture.audio_path!.split(/[/\\]/).pop() : null;

          return (
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
                  {formatTime(capture.created_at)}
                </span>
                <button onClick={() => onDelete(capture.id)} className="entry-delete" title="Delete">
                  <Trash size={12} />
                </button>
              </div>

              {/* Media if present */}
              {isImage && imageFileName && (
                <div className="entry-media">
                  <img src={`${apiBaseUrl}/images/${imageFileName}`} alt="Capture" />
                </div>
              )}
              
              {isAudio && audioFileName && (
                <div className="entry-media">
                  <audio controls className="custom-audio">
                    <source src={`${apiBaseUrl}/audio/${audioFileName}`} type="audio/ogg" />
                  </audio>
                </div>
              )}

              {/* Raw Input */}
              <div className="entry-raw">
                {capture.raw_content || capture.summary || 'No content provided.'}
              </div>

              {/* AI Distillation (Core Thesis) */}
              {capture.title && (
                <div className="entry-distillation">
                  {capture.title}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
