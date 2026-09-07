import React, { useState, useMemo } from 'react';
import { CaptureCard } from './CaptureCard';
import { AnimatePresence, motion } from 'framer-motion';
import type { Capture, SearchResult } from '../types';

interface FeedProps {
  captures: Capture[];
  searchResults: SearchResult[];
  isSearching: boolean;
  onDelete: (id: string) => void;
  apiBaseUrl: string;
}

export const Feed: React.FC<FeedProps> = ({ captures, searchResults, isSearching, onDelete, apiBaseUrl }) => {
  const [activeTab, setActiveTab] = useState('All');

  const categories = useMemo(() => {
    const cats = new Set(captures.map(c => c.category || 'Uncategorized'));
    return ['All', ...Array.from(cats)];
  }, [captures]);

  const filteredCaptures = useMemo(() => {
    if (activeTab === 'All') return captures;
    return captures.filter(c => (c.category || 'Uncategorized') === activeTab);
  }, [captures, activeTab]);

  if (isSearching) {
    if (searchResults.length === 0) {
      return (
        <div className="empty-state">
          <p>No results found for your search.</p>
        </div>
      );
    }
    
    return (
      <div className="feed-container">
        <AnimatePresence mode="popLayout">
          {searchResults.map((result) => (
            <motion.div 
              layout
              key={result.capture.id} 
              className="capture-card-wrapper"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            >
            <CaptureCard 
              capture={result.capture} 
              onDelete={onDelete} 
              apiBaseUrl={apiBaseUrl} 
            />
            {/* Display search score/match type */}
            <div className={`search-score-badge ${
                result.matchType === 'semantic' ? 'badge-semantic' :
                result.matchType === 'keyword' ? 'badge-keyword' :
                'badge-hybrid'
              }`}>
                {result.matchType} {(result.score * 100).toFixed(0)}%
            </div>
          </motion.div>
        ))}
        </AnimatePresence>
      </div>
    );
  }

  if (captures.length === 0) {
    return (
      <div className="empty-state">
        <p>Your mind is empty. Send something to the Telegram bot.</p>
      </div>
    );
  }

  return (
    <>
      <div className="tabs-container">
        {categories.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
          >
            {tab}
            {activeTab === tab && (
              <motion.div 
                layoutId="activeTab"
                className="tab-indicator"
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="feed-container">
        <AnimatePresence mode="popLayout">
          {filteredCaptures.map((capture) => (
            <motion.div 
              layout
              key={capture.id} 
              className="capture-card-wrapper"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            >
              <CaptureCard 
                capture={capture} 
                onDelete={onDelete} 
                apiBaseUrl={apiBaseUrl} 
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
};
