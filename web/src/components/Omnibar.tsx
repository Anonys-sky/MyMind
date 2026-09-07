import React, { useState, useEffect } from 'react';
import { Search, Command, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface OmnibarProps {
  onSearch: (query: string) => void;
  isSearching: boolean;
}

export const Omnibar: React.FC<OmnibarProps> = ({ onSearch, isSearching }) => {
  const [query, setQuery] = useState('');
  
  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(query);
    }, 400); // 400ms debounce
    return () => clearTimeout(timer);
  }, [query, onSearch]);

  const handleClear = () => {
    setQuery('');
    onSearch('');
  };

  return (
    <motion.div 
      className="omnibar-container"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.5 }}
    >
      <div className="omnibar-icon-left">
        <Search size={20} />
      </div>
      
      <input
        type="text"
        className="omnibar-input"
        placeholder="Search semantic thoughts..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="omnibar-icon-right">
        {query ? (
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={handleClear}
            className="clear-btn"
          >
            <X size={18} />
          </motion.button>
        ) : (
          <div className="keyboard-shortcut">
            <Command size={12} /> K
          </div>
        )}
      </div>

      <AnimatePresence>
        {isSearching && (
          <motion.div 
            className="search-indicator"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          >
            <div className="search-badge">
              <div className="pulse-dot"></div>
              Searching Neural Index...
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
