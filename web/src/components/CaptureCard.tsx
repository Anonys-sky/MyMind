import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Image as ImageIcon, Mic, FileText, CheckSquare, Trash2, Tag, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Capture } from '../types';

interface CaptureCardProps {
  capture: Capture;
  onDelete?: (id: string) => void;
  onClick?: (capture: Capture) => void;
  apiBaseUrl: string;
}

export const CaptureCard: React.FC<CaptureCardProps> = ({ capture, onDelete, onClick, apiBaseUrl }) => {
  const getIcon = () => {
    switch (capture.raw_type) {
      case 'image': return <ImageIcon size={20} className="icon-image" />;
      case 'audio': return <Mic size={20} className="icon-audio" />;
      default: return <FileText size={20} className="icon-text" />;
    }
  };

  const parseJson = (str: string | null, fallback: any = []) => {
    if (!str) return fallback;
    try {
      return JSON.parse(str);
    } catch {
      return fallback;
    }
  };

  const tags: string[] = parseJson(capture.tags);
  const actionItems: string[] = parseJson(capture.action_items);
  
  const formattedDate = formatDistanceToNow(new Date(capture.created_at), { addSuffix: true });

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -10 }}
      transition={{ type: "spring", bounce: 0, duration: 0.4 }}
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className="capture-card"
      onClick={() => onClick && onClick(capture)}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <div className="card-top-bar">
        <span className="card-meta">
          {formattedDate}
        </span>
        <div className="card-source-actions">
          <span className="source-icon" title={`Captured via ${capture.raw_type}`}>
            {getIcon()}
          </span>
          {onDelete && (
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(capture.id); }}
              className="card-delete-btn"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {capture.raw_type === 'image' && capture.image_path && (
        <div className="card-media">
          <img 
            src={`${apiBaseUrl}/images/${capture.image_path.split('/').pop()}`} 
            alt={capture.caption || 'Captured image'} 
          />
        </div>
      )}

      {capture.raw_type === 'audio' && capture.audio_path && (
        <div className="card-media" style={{ border: 'none', background: 'transparent', marginBottom: '1rem' }}>
          <audio controls className="custom-audio">
            <source src={`${apiBaseUrl}/audio/${capture.audio_path.split('/').pop()}`} type="audio/ogg" />
          </audio>
        </div>
      )}

      <div className="card-content-flat">
        <div className="core-insight">
          {capture.title}
        </div>
        {(capture.raw_content || capture.summary) && (
          <div className="raw-input">
            {capture.raw_content || capture.summary}
          </div>
        )}
      </div>

      {actionItems.length > 0 && (
        <div className="flat-checklist">
          {actionItems.map((item, idx) => (
            <div key={idx} className="flat-checklist-item">
              <CheckSquare size={14} className="checkbox-icon" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};
