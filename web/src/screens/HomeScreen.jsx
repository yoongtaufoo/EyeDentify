import React, { useState, useEffect, useRef } from 'react';
import { getChatHistory } from '../services/apiService';

// Speak helper for Tab navigation
function speak(text) {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
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
  },
  logoSection: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #F5A623, #FF8C00)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
  },
  logoText: {
    fontSize: 20,
    fontWeight: 800,
    color: '#222',
    letterSpacing: -0.3,
  },
  logoSubtext: {
    fontSize: 11,
    color: '#F5A623',
    fontWeight: 600,
    letterSpacing: 0.5,
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 50,
    border: '2px solid #E8E8E8',
    background: '#FFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    fontSize: 18,
    color: '#666',
  },
  
  // Welcome Section
  welcomeSection: {
    padding: '28px 24px 20px',
  },
  greeting: {
    fontSize: 26,
    fontWeight: 800,
    color: '#1A1A1A',
    marginBottom: 6,
    lineHeight: 1.2,
  },
  greetingHighlight: {
    color: '#F5A623',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    lineHeight: 1.4,
  },

  // Quick Actions
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: '#333',
    padding: '0 24px',
    marginBottom: 14,
    marginTop: 10,
  },
  actionsRow: {
    display: 'flex',
    gap: 12,
    padding: '0 20px',
    marginBottom: 10,
    overflowX: 'auto',
  },
  actionCard: {
    minWidth: 140,
    flexShrink: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: '18px 16px',
    border: '1px solid #EEE',
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
  },
  actionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 24,
    marginBottom: 12,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: '#333',
    marginBottom: 3,
  },
  actionDesc: {
    fontSize: 11,
    color: '#999',
    lineHeight: 1.35,
  },

  // Recent Activity
  activityList: {
    padding: '0 20px',
  },
  activityItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: '16px',
    marginBottom: 12,
    border: '1px solid #EEE',
  },
  activityHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activityType: {
    fontSize: 13,
    fontWeight: 700,
    color: '#555',
  },
  activityTime: {
    fontSize: 11,
    color: '#BBB',
  },
  activityText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 1.45,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  activityImage: {
    width: '100%',
    height: 140,
    objectFit: 'cover',
    borderRadius: 10,
    marginTop: 10,
  },

  // Stats Row
  statsRow: {
    display: 'flex',
    gap: 12,
    padding: '0 20px',
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: '18px 14px',
    textAlign: 'center',
    border: '1px solid #EEE',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 800,
    color: '#F5A623',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Empty State
  emptyState: {
    textAlign: 'center',
    padding: '40px 24px',
    color: '#AAA',
  },
  emptyIcon: { fontSize: 42, marginBottom: 12, opacity: 0.6 },
  emptyText: { fontSize: 15, color: '#BBB', lineHeight: 1.5 },
};

export default function HomeScreen({ user, onNavigate, onLogout }) {
  const [recentMessages, setRecentMessages] = useState([]);
  const [stats, setStats] = useState({ chats: 0, memories: 0 });

  // useEffect(() => {
  //   const loadRecent = async () => {
  //     try {
  //       if (!user) return;
  //       const userId = user?.id || user?.user_id;
  //       if (!userId) return;
  //       const history = await getChatHistory(userId);
  //       setRecentMessages(history.slice(0, 5));
  //       setStats({
  //         chats: history.length || 0,
  //         memories: history.filter(m => m.memory_id).length || 0,
  //       });
  //     } catch (err) {
  //       console.error('[Home] Failed to load recent:', err);
  //     }
  //   };
  //   loadRecent();
  // }, [user]);

  // Live Dashboard Tracker: Pulls down metric increments automatically every 4s
  useEffect(() => {
    const loadRecent = async () => {
      try {
        if (!user) return;
        const userId = user?.id || user?.user_id;
        if (!userId) return;

        const history = await getChatHistory(userId);
        if (history) {
          setRecentMessages([...history].reverse().slice(0, 5));
          setStats({
            chats: history.length || 0,
            memories: history.filter(m => m.memory_id).length || 0,
          });
        }
      } catch (err) {
        console.error('[Web Home Sync] Metric compilation failed:', err);
      }
    };

    loadRecent();

    const syncInterval = setInterval(loadRecent, 4000);
    return () => clearInterval(syncInterval);
  }, [user]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div style={styles.screen}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logoSection}>
          <div style={styles.logoIcon}>{'\u{1F441}\uFE0F'}</div>
          <div>
            <div style={styles.logoText}>EyeDentify</div>
            <div style={styles.logoSubtext}>AI CHAT</div>
          </div>
        </div>
        <button style={styles.profileBtn}
          aria-label="Logout" tabIndex={0}
          onClick={onLogout}
          onFocus={() => speak('Logout button. Tap to sign out.') }
        >
          {'\u{1F6AA}'}
        </button>
      </header>

      {/* Welcome */}
      <section style={styles.welcomeSection}>
        <h1 style={styles.greeting}>
          {getGreeting()}, <span style={styles.greetingHighlight}>{user?.user_metadata?.full_name || user?.name || 'Friend'}</span>
        </h1>
        <p style={styles.subtitle}>Your AI-powered visual assistant is ready to help.</p>
      </section>

      {/* Quick Stats */}
      <div style={styles.statsRow}>
        <div style={styles.statCard} tabIndex={0}
          onFocus={() => speak(`You have ${stats.chats} chats.`)}
        >
          <div style={styles.statNumber}>{stats.chats}</div>
          <div style={styles.statLabel}>Chats</div>
        </div>
        <div style={styles.statCard} tabIndex={0}
          onFocus={() => speak(`You have ${stats.memories} memories.`)}
        >
          <div style={styles.statNumber}>{stats.memories}</div>
          <div style={styles.statLabel}>Memories</div>
        </div>
      </div>

      {/* Recent Activity */}
      <h2 style={styles.sectionTitle}>Recent Activity</h2>
      <div style={styles.activityList}>
        {recentMessages.length > 0 ? (
          recentMessages.map((msg, i) => (
            <div key={i} style={styles.activityItem} tabIndex={0}
              onFocus={() => {
                const role = msg.role === 'user' ? 'You asked' : 'AI responded';
                const text = (msg.content || '').substring(0, 150);
                speak(`${role}: ${text}`);
              }}
            >
              <div style={styles.activityHeader}>
                <span style={styles.activityType}>
                  {msg.role === 'user' ? 'You asked' : 'AI responded'}
                </span>
                <span style={styles.activityTime}>{formatTime(msg.created_at)}</span>
              </div>
              <p style={styles.activityText}>{(msg.content || '').substring(0, 150)}</p>
              {msg.image_uri && (
                <img src={msg.image_uri} alt="Memory" style={styles.activityImage}
                  tabIndex={0}
                  onFocus={() => speak(`Activity image: ${msg.image_uri}`)}
                />
              )}
            </div>
          ))
        ) : (
          <div style={styles.emptyState}>
            <div style={styles.emptyIcon}>{'\u{1F4E1}'}</div>
            <p style={styles.emptyText}>No recent activity yet.<br />Start a chat or scan something!</p>
          </div>
        )}
      </div>

      {/* Bottom spacer for tab bar */}
      <div style={{ height: 80 }} />
    </div>
  );
}
