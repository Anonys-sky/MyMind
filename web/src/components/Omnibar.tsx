import React, { useState, useEffect } from 'react';
import { Search, Terminal, Command, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface OmnibarProps {
  onSearch: (query: string) => void;
  onDump: (content: string) => void;
  isSearching: boolean;
}

export const Omnibar: React.FC<OmnibarProps> = ({ onSearch, onDump, isSearching }) => {
  const [query, setQuery] = useState('');
  
  const isDumpMode = query.toLowerCase().startsWith('dump:');

  // Debounce the search input (only if not in dump mode)
  useEffect(() => {
    if (isDumpMode) {
      onSearch(''); // Clear search results if we switch to dump mode
      return;
    }

    // If it starts with 'search:', we strip it. Otherwise just use query.
    const searchQuery = query.toLowerCase().startsWith('search:') 
      ? query.slice(7).trim() 
      : query;

    const timer = setTimeout(() => {
      onSearch(searchQuery);
    }, 400); // 400ms debounce
    return () => clearTimeout(timer);
  }, [query, onSearch, isDumpMode]);

  const handleClear = () => {
    setQuery('');
    onSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isDumpMode) {
      const dumpContent = query.slice(5).trim();
      if (dumpContent) {
        onDump(dumpContent);
        setQuery('');
      }
    }
  };

  // Keyboard shortcut listener (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('omnibar-input')?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  return (
    <motion.div 
      className="omnibar-container"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", bounce: 0, duration: 0.5 }}
    >
      <div className="omnibar-icon-left">
        {isDumpMode ? <Terminal size={20} className="text-accent-primary" /> : <Search size={20} />}
      </div>
      
      <input
        id="omnibar-input"
        type="text"
        className="omnibar-input"
        placeholder="Search '...' or dump: '...'"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
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
        {isSearching && !isDumpMode && (
          <motion.div 
            className="search-indicator"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          >
            <div className="search-badge">
              <div className="pulse-dot"></div>
              Querying Semantic Vectors...
            </div>
          </motion.div>
        )}
        
        {isDumpMode && query.length > 5 && (
          <motion.div 
            className="search-indicator"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          >
            <div className="search-badge" style={{ borderColor: 'rgba(16, 185, 129, 0.3)', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)' }}>
              Press Enter to inject thought
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
