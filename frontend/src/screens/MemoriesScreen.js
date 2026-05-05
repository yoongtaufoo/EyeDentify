/**
 * MemoriesScreen.js - Saved memories grid view for EyeDentify app
 * Shows captured images and conversation history in a responsive grid.
 * Matches web UI light theme style.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../contexts/AuthContext';
import { getChatHistory } from '../services/apiService';
import * as Speech from 'expo-speech';

// Accessibility helper
const speakOnFocus = (message) => {
  Speech.stop();
  setTimeout(() => Speech.speak(message), 100);
};

function formatDateTime(ts) {
  if (!ts) return { date: '', time: '' };
  const d = new Date(ts);
  const date = d.toLocaleDateString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return { date, time };
}

export default function MemoriesScreen() {
  const { user, signOut } = useAuth();
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const activeSpeechRef = useRef(null); // track which memory is currently being spoken

  useEffect(() => {
    const loadMemories = async () => {
      try {
        if (!user) {
          setLoading(false);
          return;
        }
        const userId = user?.id || user?.user_id;
        if (!userId) {
          setLoading(false);
          return;
        }

        const history = await getChatHistory(userId);
        // Filter messages that have image_uri or memory_id (saved memories)
        const savedMemories = history.filter(
          (m) =>
            m.image_uri ||
            m.memory_id ||
            (m.content && m.role === 'assistant' && m.memory_id)
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

  // Speak on mount
  useEffect(() => {
    if (!loading) {
      if (memories.length === 0) {
        Speech.speak('Memories screen. No saved memories yet.');
      } else {
        Speech.speak(`Memories. You have ${memories.length} saved items.`);
      }
    }
  }, [loading, memories.length]);

  // Tap a memory: stop previous speech and speak the new one
  const handleSpeakMemory = (item, index) => {
    const text = item.content || item.description || 'Memory captured';
    const label = `Memory ${index + 1}`;
    // Stop any previous speech
    Speech.stop();
    // Clear active ref
    if (activeSpeechRef.current) {
      clearTimeout(activeSpeechRef.current);
      activeSpeechRef.current = null;
    }
    // Small delay then speak
    setTimeout(() => {
      Speech.speak(`${label}. ${text}`, { rate: 0.85 });
    }, 100);
  };

  // Handle logout
  const handleLogout = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Speech.speak('Logging out.');
    try { if (signOut) await signOut(); } catch (e) { console.error('[Memories] Logout error:', e); }
  };

  // Two-finger double-tap → Logout
  const twoFingerDoubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .minPointers(2)
    .onEnd(() => { handleLogout(); })
    .runOnJS(true);

  const renderMemoryCard = ({ item, index }) => {
    const { date, time } = formatDateTime(item.created_at);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => handleSpeakMemory(item, index)}
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={`Memory ${index + 1}: ${(item.content || item.description || 'Memory captured').substring(0, 100)}. Tap to speak.`}
        onFocus={() =>
          speakOnFocus(
            `Memory ${index + 1}: ${(
              item.content ||
              item.description ||
              'Memory captured'
            ).substring(0, 100)}`
          )
        }
      >
        {/* Image Section */}
        <View style={styles.cardImageWrap}>
          {item.image_uri ? (
            <Image
              source={{ uri: item.image_uri }}
              style={styles.cardImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.cardNoImage}>
              <Text style={styles.cardNoImageText}>{'\u{1F5BC}\uFE0F'}</Text>
            </View>
          )}
        </View>

        {/* Content */}
        <View style={styles.cardBody}>
          <Text style={styles.cardDesc} numberOfLines={3}>
            {(item.content || item.description || 'Memory captured').substring(0, 200)}
          </Text>

          <View style={styles.cardMeta}>
            <Text style={styles.cardDate}>{'\u{1F4C5}'} {date}</Text>
            <Text style={styles.cardTime}>{time}</Text>
            <View style={styles.cardTag}>
              <Text style={styles.cardTagText}>MEMORY</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <GestureDetector gesture={twoFingerDoubleTap}>
      <SafeAreaView style={styles.screen} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Memories</Text>
            <Text style={styles.headerCount}>Loading...</Text>
          </View>
        </View>

        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#F5A623" />
        </View>
      </SafeAreaView>
      </GestureDetector>
    );
  }

  return (
    <GestureDetector gesture={twoFingerDoubleTap}>
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Memories</Text>
          <Text style={styles.headerCount}>{memories.length} items saved</Text>
        </View>
      </View>

      {/* Memory Grid */}
      {memories.length > 0 ? (
        <FlatList
          data={memories}
          keyExtractor={(item, index) => `mem-${index}`}
          renderItem={renderMemoryCard}
          numColumns={2}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={{ gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={<View style={{ height: 80 }} />}
        />
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>{'\u{1F392}'}</Text>
          <Text style={styles.emptyTitle}>No memories yet</Text>
          <Text style={styles.emptyText}>
            When you capture images or have conversations with AI, they will appear here.
          </Text>
          <Text style={styles.emptyHint}>Go to Chat and start scanning!</Text>
        </View>
      )}
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEE',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#222',
  },
  headerCount: {
    fontSize: 13,
    color: '#999',
    fontWeight: '500',
  },

  gridContent: {
    padding: 16,
  },

  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EEE',
    overflow: 'hidden',
    marginBottom: 4,
  },
  cardImageWrap: {
    width: '100%',
    height: 150,
    backgroundColor: '#F0F0F0',
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardNoImage: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
  },
  cardNoImageText: {
    fontSize: 36,
    opacity: 0.45,
  },
  cardBody: {
    padding: 14,
    paddingVertical: 12,
  },
  cardDesc: {
    fontSize: 13,
    color: '#444',
    lineHeight: 19,
    marginBottom: 10,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  cardDate: {
    fontSize: 11.5,
    color: '#BBB',
    fontWeight: '500',
    flexShrink: 1,
  },
  cardTime: {
    fontSize: 11.5,
    color: '#DDD',
  },
  cardTag: {
    backgroundColor: '#FFF8EE',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
  },
  cardTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#F5A623',
    letterSpacing: 0.4,
  },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 60,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 18,
    opacity: 0.45,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#888',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#AAA',
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 280,
  },
  emptyHint: {
    fontSize: 13,
    color: '#CCC',
    marginTop: 8,
  },
});
