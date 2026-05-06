import React, { useState, useEffect } from 'react';
import { getChatHistory } from '../services/apiService';

// Speak helper for Tab navigation (accessibility)
function speak(text) {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    speechSynthesis.speak(u);
  }
}

// Speaks full memory text content (slower rate for longer descriptions)
function speakMemoryFull(label, text) {
  const content = text || 'No description available.';
  const fullText = `${label}. ${content}`;
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(fullText);
    u.rate = 0.85;
    speechSynthesis.speak(u);
  }
}

const styles = {
  screen: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
    backgroundColor: '#F7F7F7',
  },
  // Header
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    backgroundColor: '#FFFFFF',
    borderBottom: '1px solid #EEE',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: '#222',
  },
  headerCount: {
    fontSize: 13,
    color: '#999',
    fontWeight: 500,
  },

  // Memory Grid - responsive for web layout
  memoryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 16,
    padding: '16px 20px',
  },
  // Memory Card (single column variant)
  memoryList: {
    padding: '16px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  
  // Memory Card - optimized for grid
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    border: '1px solid #EEE',
    overflow: 'hidden',
    transition: 'transform 0.15s, box-shadow 0.15s',
    display: 'flex',
    flexDirection: 'column',
  },
  cardImageWrap: {
    position: 'relative',
    width: '100%',
    height: 180,
    backgroundColor: '#F0F0F0',
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  cardNoImage: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#CCC',
    fontSize: 36,
    background: 'linear-gradient(135deg, #F5F5F5, #ECECEC)',
  },
  cardBody: {
    padding: '14px 16px',
  },
  cardDesc: {
    fontSize: 13.5,
    color: '#444',
    lineHeight: 1.5,
    marginBottom: 10,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardDate: {
    fontSize: 11.5,
    color: '#BBB',
    fontWeight: 500,
  },
  cardTime: {
    fontSize: 11.5,
    color: '#DDD',
  },
  cardTag: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    color: '#F5A623',
    backgroundColor: '#FFF8EE',
    padding: '3px 9px',
    borderRadius: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  // Empty State
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 30px',
    textAlign: 'center',
  },
  emptyIcon: { fontSize: 56, marginBottom: 18, opacity: 0.45 },
  emptyTitle: { fontSize: 19, fontWeight: 700, color: '#888', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#AAA', lineHeight: 1.6, maxWidth: 280 },

  // Loading State
  loadingContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    width: 38,
    height: 38,
    border: '4px solid #E8E8E8',
    borderTopColor: '#F5A623',
    borderRadius: '50%',
    animation: 'spinMemories 0.75s linear infinite',
  },

  // Bottom spacer for tab bar
  bottomSpacer: { height: 80 },
};

function formatDateTime(ts) {
  if (!ts) return { date: '', time: '' };
  const d = new Date(ts);
  const date = d.toLocaleDateString([], { 
    year: 'numeric', month: 'short', day: 'numeric' 
  });
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return { date, time };
}

export default function MemoriesScreen({ user }) {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMemories = async () => {
      try {
        if (!user) { setLoading(false); return; }
        const userId = user?.id || user?.user_id;
        if (!userId) { setLoading(false); return; }
        
        const history = await getChatHistory(userId);
        // Filter messages that have image_uri or memory_id (saved memories)
        // const savedMemories = history.filter(
        //   m => m.image_uri || m.memory_id || (m.content && m.role === 'assistant' && m.memory_id)
        // );
        const savedMemories = history.filter(
          m => m.role === 'assistant' && (m.image_uri || m.memory_id)
        );
        setMemories(savedMemories || []);
      } catch (err) {
        console.error('[Memories] Failed to load:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadMemories();
  }, [user]);

  if (loading) {
    return (
      <div style={styles.screen}>
        <header style={styles.header}>
          <div>
            <div style={styles.headerTitle}>Memories</div>
            <div style={styles.headerCount}>Loading...</div>
          </div>
        </header>
        <div style={styles.loadingContainer}>
          <div style={styles.spinner} />
          <style>{`@keyframes spinMemories { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.screen}>
      {/* Header */}
      <header style={styles.header}>
        <div>
          <div style={styles.headerTitle}>Memories</div>
          <div style={styles.headerCount}>{memories.length} items saved</div>
        </div>
      </header>

      {/* Memory Grid */}
      {memories.length > 0 ? (
        <div style={styles.memoryGrid}>
          {memories.map((mem, i) => {
            const { date, time } = formatDateTime(mem.created_at);
            const memoryText = mem.content || mem.description || 'Memory captured';
            return (
              <article key={i} style={styles.card} tabIndex={0}
                onFocus={() => speakMemoryFull(`Memory ${i + 1} of ${memories.length}`, memoryText)}
              >
                {/* Image Section */}
                <div style={styles.cardImageWrap}>
                  {mem.image_uri ? (
                    <img
                      src={mem.image_uri}
                      alt={`Memory ${i+1}: ${memoryText.substring(0, 100)}`}
                      style={styles.cardImage}
                      tabIndex={0}
                      onFocus={() => speakMemoryFull(`Memory image ${i + 1}`, memoryText)}
                    />
                  ) : (
                    <div style={styles.cardNoImage}>{'\u{1F5BC}\uFE0F'}</div>
                  )}
                </div>

                {/* Content */}
                <div style={styles.cardBody}>
                  <p style={styles.cardDesc}>
                    {(mem.content || mem.description || 'Memory captured').substring(0, 200)}
                  </p>
                  
                  <div style={styles.cardMeta}>
                    <span style={styles.cardDate}>{'\u{1F4C5}'} {date}</span>
                    <span style={styles.cardTime}>{time}</span>
                    <span style={styles.cardTag}>Memory</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>{'\u{1F392}'}</div>
          <h3 style={styles.emptyTitle}>No memories yet</h3>
          <p style={styles.emptyText}>
            When you capture images or have conversations with AI, they will appear here.
            Go to Chat and start scanning!
          </p>
        </div>
      )}

      <div style={styles.bottomSpacer} />
      
      {/* Animation styles */}
      <style>{`
        @keyframes spinMemories { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
