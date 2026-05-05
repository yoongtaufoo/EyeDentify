import React, { useState, useEffect } from 'react';
import HomeScreen from './HomeScreen';
import ChatScreen from './ChatScreen';
import MemoriesScreen from './MemoriesScreen';

// Speak helper for accessibility (Tab navigation)
function speak(text) {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    speechSynthesis.speak(u);
  }
}

const TABS = [
  { id: 'home', label: 'Home', icon: '\u{1F3E0}', desc: 'Home tab. Dashboard with quick actions and recent activity.' },
  { id: 'chat', label: 'Chat', icon: '\u{1F4AC}', desc: 'Chat tab. Talk to AI assistant with camera and voice input.' },
  { id: 'memories', label: 'Memories', icon: '\u{1F4F7}', desc: 'Memories tab. View saved images and conversation history.' },
];

const styles = {
  layout: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#F7F7F7',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },

  // Hardware Status Bar
  hwStatusBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 16px',
    backgroundColor: '#FFFFFF',
    borderBottom: '1px solid #EEE',
    flexShrink: 0,
    fontSize: 11,
  },
  hwStatusLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  hwItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    color: '#888',
    fontWeight: 500,
  },
  hwIcon: { fontSize: 13 },
  hwLabel: { fontSize: 10.5, color: '#AAA', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 },
  hwConnected: { color: '#4CAF50' },
  hwDisconnected: { color: '#D94A4A' },
  hwUnknown: { color: '#999' },

  tabBar: {
    display: 'flex',
    backgroundColor: '#FFFFFF',
    borderTop: '1px solid #E8E8E8',
    paddingBottom: 'env(safe-area-inset-bottom)',
    flexShrink: 0,
    position: 'relative',
  },
  tabItem: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 0 6px',
    cursor: 'pointer',
    border: 'none',
    background: 'none',
    fontSize: 11,
    color: '#999',
    fontFamily: 'inherit',
    transition: 'color 0.2s',
    gap: 2,
  },
  tabItemActive: {
    color: '#F5A623',
  },
  tabIcon: {
    fontSize: 22,
    lineHeight: 1,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.2,
  },
  indicatorWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    pointerEvents: 'none',
  },
  indicator: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#F5A623',
    transition: 'all 0.25s ease',
  },
};

export default function MainLayout({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('home');

  // Hardware connection state simulation
  // In production, this would poll actual hardware endpoints
  const [hwStatus, setHwStatus] = useState({
    device: { connected: null, label: 'Checking...' },
    camera: { connected: null, label: 'Checking...' },
  });

  useEffect(() => {
    // Simulate hardware check - replace with real endpoint calls
    const timer = setTimeout(() => {
      setHwStatus({
        device: { connected: false, label: 'Hardware Device' },
        camera: { connected: navigator?.mediaDevices ? true : false, label: 'Camera' },
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <HomeScreen user={user} onNavigate={setActiveTab} onLogout={onLogout} />;
      case 'chat':
        return <ChatScreen user={user} onLogout={onLogout} />;
      case 'memories':
        return <MemoriesScreen user={user} />;
      default:
        return <HomeScreen user={user} onNavigate={setActiveTab} />;
    }
  };

  const HwStatusDot = ({ status }) => {
    const dotColor = status === true ? '#4CAF50' : status === false ? '#D94A4A' : '#CCC';
    return (
      <span style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: '50%',
        backgroundColor: dotColor,
        marginRight: 4,
      }} />
    );
  };

  return (
    <div style={styles.layout}>
      {/* Hardware Status Bar */}
      <div style={styles.hwStatusBar}>
        <span style={styles.hwLabel}>Hardware</span>
        <div style={styles.hwStatusLeft}>
          <div style={{
            ...styles.hwItem,
            ...(hwStatus.device.connected === true ? styles.hwConnected :
              hwStatus.device.connected === false ? styles.hwDisconnected : styles.hwUnknown),
          }}>
            <HwStatusDot status={hwStatus.device.connected} />
            <span>{hwStatus.device.label}</span>
          </div>
          <div style={{
            ...styles.hwItem,
            ...(hwStatus.camera.connected === true ? styles.hwConnected :
              hwStatus.camera.connected === false ? styles.hwDisconnected : styles.hwUnknown),
          }}>
            <HwStatusDot status={hwStatus.camera.connected} />
            <span>{hwStatus.camera.label}</span>
          </div>
        </div>
        <div style={{ ...styles.hwItem, color: '#BBB', fontSize: 10.5 }}>
          EyeDentify v2.0
        </div>
      </div>

      <div style={styles.content}>
        {renderContent()}
      </div>
      
      {/* Bottom Tab Bar */}
      <nav style={styles.tabBar} role="tablist" aria-label="Main navigation">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-label={`${tab.label} tab`}
            onClick={() => setActiveTab(tab.id)}
            style={{
              ...styles.tabItem,
              ...(activeTab === tab.id ? styles.tabItemActive : {}),
            }}
            tabIndex={0}
            onFocus={() => speak(`${tab.desc} Currently ${activeTab === tab.id ? 'active' : 'not active'}.`)}
          >
            <span style={styles.tabIcon}>{tab.icon}</span>
            <span style={styles.tabLabel}>{tab.label}</span>
          </button>
        ))}

        {/* Active Tab Indicator — positioned inside tabBar for alignment */}
        <div style={styles.indicatorWrapper}>
          <div
            style={{
              ...styles.indicator,
              width: `${100 / TABS.length}%`,
              marginLeft: `${TABS.findIndex(t => t.id === activeTab) * (100 / TABS.length)}%`,
            }}
          />
        </div>
      </nav>
    </div>
  );
}
