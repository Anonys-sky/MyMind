import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph2D, { ForceGraphMethods } from 'react-force-graph-2d';
import type { Capture } from '../types';

interface GraphViewProps {
  captures: Capture[];
  links: { source: string; target: string; score: number }[];
  onNodeClick: (node: Capture) => void;
  searchQuery?: string;
}

export const GraphView: React.FC<GraphViewProps> = ({ captures, links, onNodeClick, searchQuery }) => {
  const fgRef = useRef<ForceGraphMethods>();
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [hoverNode, setHoverNode] = useState<Capture | null>(null);

  // Resize listener
  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Format data for the graph
  const graphData = useMemo(() => {
    // Map captures to nodes. Force graph mutates the objects, so we make copies.
    const nodes = captures.map(c => ({
      ...c,
      val: 1, // Base size
    }));

    // Count connections for node sizing
    const connectionCounts: Record<string, number> = {};
    links.forEach(l => {
      connectionCounts[l.source] = (connectionCounts[l.source] || 0) + 1;
      connectionCounts[l.target] = (connectionCounts[l.target] || 0) + 1;
    });

    nodes.forEach(n => {
      n.val = 1 + (connectionCounts[n.id] || 0) * 0.5;
    });

    return {
      nodes,
      links: links.map(l => ({ ...l })), // Copy links too
    };
  }, [captures, links]);

  const handleNodeClick = useCallback((node: any) => {
    // Center camera on node
    fgRef.current?.centerAt(node.x, node.y, 1000);
    fgRef.current?.zoom(4, 1000);
    
    // Call external handler (e.g. open side panel)
    onNodeClick(node as Capture);
  }, [onNodeClick]);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', background: '#09090b', zIndex: 0 }}>
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeId="id"
        nodeLabel={(node: any) => node.title || 'Untitled'}
        
        // Styling nodes
        nodeColor={(node: any) => {
          if (hoverNode && hoverNode.id === node.id) return '#ffffff';
          if (searchQuery && node.title?.toLowerCase().includes(searchQuery.toLowerCase())) return '#3b82f6'; // blue-500
          
          // Color by category
          switch (node.category) {
            case 'idea': return '#a855f7'; // purple
            case 'task': return '#ef4444'; // red
            case 'reference': return '#10b981'; // green
            case 'quote': return '#f59e0b'; // amber
            default: return '#71717a'; // zinc-500
          }
        }}
        nodeRelSize={4}
        
        // Link styling
        linkColor={() => 'rgba(255, 255, 255, 0.1)'}
        linkWidth={(link: any) => (link.score - 0.8) * 10} // Thicker for higher similarity
        
        // Interaction
        onNodeClick={handleNodeClick}
        onNodeHover={(node: any) => setHoverNode(node)}
        
        // Physics
        d3AlphaDecay={0.02}
        d3VelocityDecay={0.3}
        warmupTicks={100}
        cooldownTicks={0}
      />
    </div>
  );
};
