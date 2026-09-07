import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image as ImageIcon, Mic, FileText } from 'lucide-react';
import type { Capture } from '../types';
import { formatDistanceToNow } from 'date-fns';

interface InsightPanelProps {
  capture: Capture | null;
  onClose: () => void;
  apiBaseUrl: string;
}

export const InsightPanel: React.FC<InsightPanelProps> = ({ capture, onClose, apiBaseUrl }) => {
  return (
    <AnimatePresence>
      {capture && (
        <>
          <motion.div 
            className="panel-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div 
            className="insight-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          >
            <div className="panel-header">
              <div className="panel-meta">
                <span className="source-icon">
                  {capture.raw_type === 'image' ? <ImageIcon size={16} /> : 
                   capture.raw_type === 'audio' ? <Mic size={16} /> : 
                   <FileText size={16} />}
                </span>
                {formatDistanceToNow(new Date(capture.created_at), { addSuffix: true })}
              </div>
              <button className="close-btn" onClick={onClose}>
                <X size={20} />
              </button>
            </div>

            <div className="panel-scroll-content">
              {/* Media */}
              {capture.raw_type === 'image' && capture.image_path && (
                <div className="panel-media">
                  <img src={`${apiBaseUrl}/images/${capture.image_path.split('/').pop()}`} alt="Capture" />
                </div>
              )}
              {capture.raw_type === 'audio' && capture.audio_path && (
                <div className="panel-media">
                  <audio controls className="custom-audio">
                    <source src={`${apiBaseUrl}/audio/${capture.audio_path.split('/').pop()}`} type="audio/ogg" />
                  </audio>
                </div>
              )}

              {/* Core Thesis (Title) */}
              <h2 className="panel-core-insight">
                {capture.title}
              </h2>

              {/* Raw Input */}
              {(capture.raw_content || capture.summary) && (
                <div className="panel-raw-input">
                  {capture.raw_content || capture.summary}
                </div>
              )}
              
              {/* Semantic Vectors (Tags) - Muted/Hidden */}
              {capture.tags && (
                <div className="panel-vectors">
                  <h3>Semantic Vectors</h3>
                  <div className="vector-pills">
                    {(() => {
                      try {
                        const parsedTags = JSON.parse(capture.tags);
                        return Array.isArray(parsedTags) && parsedTags.map(tag => (
                          <span key={tag} className="vector-pill">{tag}</span>
                        ));
                      } catch {
                        return null;
                      }
                    })()}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
