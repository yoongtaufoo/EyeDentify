/**
 * HomeScreen.js - Dashboard for EyeDentify app
 * Shows greeting, quick actions, stats, and recent activity.
 * Matches the web UI light theme style.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureDetector, Gesture, Directions } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../contexts/AuthContext';
import { getChatHistory } from '../services/apiService';
import * as Speech from 'expo-speech';

const { width } = Dimensions.get('window');

// Accessibility helper: speaks when element receives focus
const speakOnFocus = (message) => {
  Speech.stop();
  setTimeout(() => Speech.speak(message), 100);
};

function formatTime(ts) {
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
}

export default function HomeScreen({ navigation }) {
  const { user, signOut } = useAuth();
  const [recentMessages, setRecentMessages] = useState([]);
  const [stats, setStats] = useState({ chats: 0, memories: 0 });
  const [hwStatus, setHwStatus] = useState({
    device: { connected: null, label: 'Checking...' },
    camera: { connected: null, label: 'Checking...' },
  });

  useEffect(() => {
    const loadRecent = async () => {
      try {
        if (!user) return;
        const userId = user?.id || user?.user_id;
        if (!userId) return;
        const history = await getChatHistory(userId);
        setRecentMessages(history.slice(0, 5));
        setStats({
          chats: history.length || 0,
          memories: history.filter(m => m.memory_id).length || 0,
        });
      } catch (err) {
        console.error('[Home] Failed to load recent:', err);
      }
    };
    loadRecent();
  }, [user]);

  // Speak welcome whenever the user enters or returns to the Home tab
  useEffect(() => {
    const playHomeGreeting = () => {
      const hour = new Date().getHours();
      let timeGreeting = 'Good evening';
      if (hour < 12) timeGreeting = 'Good morning';
      else if (hour < 17) timeGreeting = 'Good afternoon';
      
      const name = user?.user_metadata?.full_name || user?.name || 'Friend';
      
      // Interrupt any lingering text-to-speech cleanly
      // before announcing the dashboard entry point
      Speech.stop();
      Speech.speak(`${timeGreeting}, ${name}. Welcome back to EyeDentify.`, { rate: 0.9 });
    };

    // 1. Run immediately if the screen mounts and the user data is available
    if (user) {
      playHomeGreeting();
    }

    // 2. Run whenever the user clicks back onto the Home tab from Chat or Memories
    const unsubscribe = navigation.addListener('focus', () => {
      playHomeGreeting();
    });

    return unsubscribe;
  }, [navigation, user]);

  // Simulate hardware status check
  useEffect(() => {
    const timer = setTimeout(() => {
      setHwStatus({
        device: { connected: false, label: 'Hardware' },
        camera: { connected: true, label: 'Camera' },
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Handle logout
  const handleLogout = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Speech.speak('Logging out.');
    try {
      if (signOut) await signOut();
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  // Two-finger double-tap → Logout
  const twoFingerDoubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .minPointers(2)
    .onEnd(() => {
      handleLogout();
    })
    .runOnJS(true);

  // Swipe left → Go to Chat tab
  const swipeLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .onEnd(() => {
      navigation.navigate('Chat');
    })
    .runOnJS(true);

  // Combine gestures
  const combinedGesture = Gesture.Exclusive(
    Gesture.Simultaneous(twoFingerDoubleTap, swipeLeft)
  );

  // Speak welcome on mount
  useEffect(() => {
    const hour = new Date().getHours();
    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';
    const name = user?.user_metadata?.full_name || user?.name || 'Friend';
    Speech.speak(`${greeting}, ${name}. Welcome to EyeDentify.`);
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const quickActions = [
    {
      icon: '\u{1F4AC}',
      label: 'New Chat',
      desc: 'Ask AI anything',
      bgColor: '#FFF4E0',
      iconBg: '#FFE8B8',
      action: () => navigation.getParent()?.navigate('Chat'),
    },
    {
      icon: '\u{1F3A0}',
      label: 'Scan Object',
      desc: 'Use camera vision',
      bgColor: '#E8F5FF',
      iconBg: '#D0EBFF',
      action: () => navigation.getParent()?.navigate('Chat'),
    },
    {
      icon: '\u{1F4F7}',
      label: 'Memories',
      desc: 'View saved items',
      bgColor: '#F3E8FF',
      iconBg: '#E8D8FF',
      action: () => navigation.getParent()?.navigate('Memories'),
    },
  ];

  return (
    <GestureDetector gesture={combinedGesture}>
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoSection}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoIconText}>{'\u{1F441}\uFE0F'}</Text>
          </View>
          <View>
            <Text style={styles.logoText}>EyeDentify</Text>
            <Text style={styles.logoSubtext}>AI CHAT</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.logoutBtn}
          activeOpacity={0.7}
          onPress={handleLogout}
          accessible={true}
          accessibilityLabel="Logout"
          onFocus={() => speakOnFocus('Logout button. Tap to sign out.')}
        >
          <Text style={styles.logoutBtnText}>{'\u{1F6AA}'}</Text>
        </TouchableOpacity>
      </View>

      {/* Hardware Status Bar */}
      <View style={styles.hwStatusBar}>
        <Text style={styles.hwLabel}>Hardware</Text>
        <View style={styles.hwStatusRight}>
          <View style={styles.hwItem}>
            <View style={[styles.hwDot, hwStatus.device.connected === true ? styles.hwDotConnected : hwStatus.device.connected === false ? styles.hwDotDisconnected : styles.hwDotUnknown]} />
            <Text style={[styles.hwItemText, hwStatus.device.connected === true ? styles.hwTextConnected : hwStatus.device.connected === false ? styles.hwTextDisconnected : styles.hwTextUnknown]}>{hwStatus.device.label}</Text>
          </View>
          <View style={styles.hwItem}>
            <View style={[styles.hwDot, hwStatus.camera.connected === true ? styles.hwDotConnected : hwStatus.camera.connected === false ? styles.hwDotDisconnected : styles.hwDotUnknown]} />
            <Text style={[styles.hwItemText, hwStatus.camera.connected === true ? styles.hwTextConnected : hwStatus.camera.connected === false ? styles.hwTextDisconnected : styles.hwTextUnknown]}>{hwStatus.camera.label}</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Welcome */}
        <View style={styles.welcomeSection}>
          <Text style={styles.greeting}>
            {getGreeting()}, <Text style={styles.greetingHighlight}>{user?.user_metadata?.full_name || user?.name || 'Friend'}</Text>
          </Text>
          <Text style={styles.subtitle}>Your AI-powered visual assistant is ready.</Text>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.chats}</Text>
            <Text style={styles.statLabel}>Chats</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.memories}</Text>
            <Text style={styles.statLabel}>Memories</Text>
          </View>
        </View>

        {/* Recent Activity */}
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <View style={styles.activityList}>
          {recentMessages.length > 0 ? (
            recentMessages.map((msg, i) => (
              <TouchableOpacity
                key={i}
                style={styles.activityItem}
                activeOpacity={0.7}
                accessible={true}
                onFocus={() => speakOnFocus(`${msg.role === 'user' ? 'You asked' : 'AI responded'}: ${(msg.content || '').substring(0, 80)}`)}
              >
                <View style={styles.activityHeader}>
                  <Text style={styles.activityType}>
                    {msg.role === 'user' ? 'You asked' : 'AI responded'}
                  </Text>
                  <Text style={styles.activityTime}>{formatTime(msg.created_at)}</Text>
                </View>
                <Text style={styles.activityText} numberOfLines={2}>
                  {msg.content || ''}
                </Text>
                {msg.image_uri && (
                  <Image source={{ uri: msg.image_uri }} style={styles.activityImage} />
                )}
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>{'\u{1F4E1}'}</Text>
              <Text style={styles.emptyText}>No recent activity yet.</Text>
              <Text style={styles.emptyHint}>Start a chat or scan something!</Text>
            </View>
          )}
        </View>

        {/* Bottom spacer for tab bar */}
        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
  logoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F5A623',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIconText: {
    fontSize: 18,
  },
  logoText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#222',
  },
  logoSubtext: {
    fontSize: 10,
    color: '#F5A623',
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E8E8E8',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutBtnText: {
    fontSize: 18,
  },

  // Hardware Status Bar
  hwStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
  hwLabel: {
    fontSize: 10.5,
    color: '#AAA',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  hwStatusRight: {
    flexDirection: 'row',
    gap: 14,
  },
  hwItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  hwDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  hwDotConnected: {
    backgroundColor: '#4CAF50',
  },
  hwDotDisconnected: {
    backgroundColor: '#D94A4A',
  },
  hwDotUnknown: {
    backgroundColor: '#CCC',
  },
  hwItemText: {
    fontSize: 11,
    fontWeight: '500',
  },
  hwTextConnected: {
    color: '#4CAF50',
  },
  hwTextDisconnected: {
    color: '#D94A4A',
  },
  hwTextUnknown: {
    color: '#999',
  },
  scrollView: {
    flex: 1,
  },

  welcomeSection: {
    paddingTop: 28,
    paddingBottom: 16,
    paddingHorizontal: 24,
  },
  greeting: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1A1A1A',
    marginBottom: 6,
    lineHeight: 32,
  },
  greetingHighlight: {
    color: '#F5A623',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EEE',
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#F5A623',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    paddingHorizontal: 24,
    marginBottom: 14,
    marginTop: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
  },
  actionCard: {
    minWidth: 140,
    borderRadius: 18,
    padding: 18,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  actionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  actionIcon: {
    fontSize: 24,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    marginBottom: 3,
  },
  actionDesc: {
    fontSize: 11,
    color: '#999',
    lineHeight: 15,
  },

  activityList: {
    paddingHorizontal: 20,
  },
  activityItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activityType: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
  },
  activityTime: {
    fontSize: 11,
    color: '#BBB',
  },
  activityText: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
  },
  activityImage: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    marginTop: 10,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 42,
    marginBottom: 12,
    opacity: 0.6,
  },
  emptyText: {
    fontSize: 15,
    color: '#BBB',
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: '#CCC',
    marginTop: 4,
  },
});
