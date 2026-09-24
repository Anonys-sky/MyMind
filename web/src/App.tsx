import { useState, useEffect, useCallback } from 'react';
import { Omnibar } from './components/Omnibar';
import { MasonryFeed } from './components/MasonryFeed';
import { Brain, Database, Activity, ServerCrash } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Capture, SearchResult, Stats } from './types';

const API_BASE_URL = 'http://localhost:3001';

const HEADERS = {
  'Content-Type': 'application/json'
};

function App() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCaptures = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/captures?limit=50`, { headers: HEADERS });
      if (!res.ok) throw new Error('Failed to fetch captures');
      const data = await res.json();
      setCaptures(data.captures);
    } catch (e: any) {
      console.error(e);
      setError('Could not connect to MyMind core API.');
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/stats`, { headers: HEADERS });
      if (res.ok) {
        const data = await res.json();
        setStats(data.stats);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const init = async () => {
    setIsLoading(true);
    await Promise.all([fetchCaptures(), fetchStats()]);
    setIsLoading(false);
  };

  useEffect(() => {
    init();
    const interval = setInterval(init, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSearch = useCallback(async (searchQuery: string) => {
    setQuery(searchQuery);
    
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/search`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ query: searchQuery, limit: 15 })
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleDump = useCallback(async (content: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/captures/dump`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify({ content })
      });
      if (res.ok) {
        // Optimistically reload captures
        fetchCaptures();
        fetchStats();
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/captures/${id}`, {
        method: 'DELETE',
        headers: HEADERS
      });
      setCaptures(prev => prev.filter(c => c.id !== id));
      setSearchResults(prev => prev.filter(r => r.capture.id !== id));
      fetchStats();
    } catch (e) {
      console.error(e);
    }
  };

  if (error) {
    return (
      <div className="error-container">
        <div className="error-card glass-panel">
          <ServerCrash size={48} className="error-icon" />
          <h2 className="error-title">Connection Failed</h2>
          <p className="error-desc">{error}</p>
          <p className="error-hint">Make sure the Express API is running on port 3001.</p>
        </div>
      </div>
    );
  }

  // Determine what list to show
  const displayCaptures = query && searchResults.length > 0 
    ? searchResults.map(r => r.capture)
    : captures;

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <div className="brand">
            <div className="brand-icon">
              <Brain size={16} />
            </div>
            <h1 className="brand-title">MyMind</h1>
          </div>
          
          {stats && (
            <div className="header-stats">
              <div className="stat-item" title="Total Captures">
                <Database size={14} className="stat-icon-primary" /> 
                {stats.total} entries
              </div>
              <div className="stat-item" title="Activity this week">
                <Activity size={14} className="stat-icon-secondary" />
                {stats.thisWeek} this week
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="main-content">
        <Omnibar 
          onSearch={handleSearch} 
          onDump={handleDump}
          isSearching={isSearching} 
        />
        
        <AnimatePresence mode="wait">
          {isLoading && captures.length === 0 ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="loading-state"
            >
              <motion.div 
                className="spinner"
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              />
              <p>Syncing neural index...</p>
            </motion.div>
          ) : (
            <motion.div 
              key="feed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <MasonryFeed 
                captures={displayCaptures}
                onDelete={handleDelete}
                apiBaseUrl={API_BASE_URL}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default App;
