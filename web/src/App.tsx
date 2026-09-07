import React, { useState, useEffect, useCallback } from 'react';
import { Omnibar } from './components/Omnibar';
import { GraphView } from './components/GraphView';
import { InsightPanel } from './components/InsightPanel';
import { Brain, Database, Activity, ServerCrash } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Capture, SearchResult, Stats } from './types';

const API_BASE_URL = 'http://localhost:3001';

const HEADERS = {
  'Content-Type': 'application/json'
};

function App() {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [links, setLinks] = useState<{ source: string; target: string; score: number }[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<Capture | null>(null);

  const fetchGraph = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/graph`, { headers: HEADERS });
      if (!res.ok) throw new Error('Failed to fetch graph data');
      const data = await res.json();
      setCaptures(data.nodes);
      setLinks(data.links);
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
    await Promise.all([fetchGraph(), fetchStats()]);
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
      setIsSearching(false);
      return;
    }

    // We don't fetch from backend anymore because GraphView filters locally and highlights!
    setIsSearching(true);
    setTimeout(() => setIsSearching(false), 500); // Just for UI pulse effect
  }, []);

  const handleDelete = async (id: string) => {
    // Left empty for now, can be added inside InsightPanel later
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

      <main className="main-content" style={{ pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }}>
          <Omnibar onSearch={handleSearch} isSearching={isSearching} />
        </div>
        
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
              style={{ pointerEvents: 'auto' }}
            >
              <GraphView 
                captures={captures}
                links={links}
                onNodeClick={(node) => setSelectedNode(node)}
                searchQuery={query}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <InsightPanel 
        capture={selectedNode}
        onClose={() => setSelectedNode(null)}
        apiBaseUrl={API_BASE_URL}
      />
    </div>
  );
}

export default App;
