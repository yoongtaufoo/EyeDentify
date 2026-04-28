/**
 * ChatScreen.js - Main chat interface for EyeDentify
 *
 * DUAL-VIEW ARCHITECTURE:
 *   1) Chat History View (default) - messages, text input, audio recording
 *   2) Camera View - live camera preview, double-tap to capture
 *
 * GESTURE MAP:
 *   ──────────────────────────────────────────────────────
 *   CHAT VIEW:
 *     • Tap LEFT edge (left 25%)    → Switch to Camera View
 *     • Long-press mic button       → Record audio (release to send)
 *     • Two-finger double-tap       → Logout
 *     • Type text + tap Send         → Send text message
 *
 *   CAMERA VIEW:
 *     • Double-tap anywhere          → Take photo → AI process → back to Chat
 *     · Swipe right                  → Back to Chat History (no photo)
 *   ──────────────────────────────────────────────────────
 *
 * ACCESSIBILITY: Full TalkBack/VoiceOver support, Speech announcements.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  GestureDetector,
  Gesture,
  Directions,
} from 'react-native-gesture-handler';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { AudioModule, useAudioRecorder, RecordingPresets, setAudioModeAsync, useAudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '../contexts/AuthContext';
import { getChatHistory, processImage, sendChatMessage, sendAudioMessage } from '../services/apiService';

// ============================================================
// VIEW MODES
// ============================================================
const VIEW = {
  CHAT: 'chat',
  CAMERA: 'camera',
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ChatScreen() {
  const { user, signOut } = useAuth();

  // ---- View state ----
  const [viewMode, setViewMode] = useState(VIEW.CHAT);
  const [hasWelcomed, setHasWelcomed] = useState(false);

  // ---- Chat state ----
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  // ---- User profile (for welcome message) ----
  const [userFullName, setUserFullName] = useState('');

  // ---- Camera ----
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  // ---- Audio Recording + Playback (expo-audio v1.x — works in Expo Go) ----
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [playbackUri, setPlaybackUri] = useState(null);
  const player = useAudioPlayer(playbackUri);
  const flatListRef = useRef(null);

  /** Replay audio on every press — seek to start then play */
  const handlePlayVoice = (uri) => {
    setPlaybackUri(uri);
    setTimeout(() => {
      try { player.seekTo(0); } catch {}
      try { player.play(); } catch {}
    }, 100);
  };

  // ============================================================
  // ON MOUNT: Load history + welcome user
  // ============================================================
  useEffect(() => {
    if (!user) return;
    loadChatHistory();
    fetchUserProfile();
  }, [user]);

  // Welcome message once when chat view is first shown
  useEffect(() => {
    if (!hasWelcomed && userFullName && viewMode === VIEW.CHAT) {
      setHasWelcomed(true);
      const greeting = `Welcome back, ${userFullName}. EyeDentify ready.`;
      Speech.speak(greeting, { rate: 0.9 });
    }
  }, [hasWelcomed, userFullName, viewMode]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [messages]);

  // Track keyboard height for Android (pan mode handles this natively now)

  // ============================================================
  // DATA LOADING
  // ============================================================
  const loadChatHistory = async () => {
    setLoading(true);
    const history = await getChatHistory(user.id);
    
    if (history && history.length > 0) {
      const formatted = history.map((msg) => ({
        id: msg.id || String(Math.random()),
        role: msg.role,
        content: msg.content,
      }));
      setMessages(formatted);
    } else {
      // If backend is down, we don't crash, we just show a welcome message
      setMessages([{ 
        id: 'welcome', 
        role: 'assistant', 
        content: "I couldn't reach my brain, but I'm still here to help locally." 
      }]);
    }
    setLoading(false);
  };
  // const loadChatHistory = async () => {
  //   try {
  //     const history = await getChatHistory(user.id);
  //     const formatted = history.map((msg) => ({
  //       id: msg.id || `msg-${Date.now()}-${Math.random()}`,
  //       role: msg.role,
  //       content: msg.content,
  //       timestamp: msg.created_at,
  //       imageUri: msg.image_uri || null,
  //     }));
  //     setMessages(formatted);
  //   } catch (e) {
  //     console.error('Failed to load chat history:', e);
  //   }
  // };

  const fetchUserProfile = async () => {
    // Get full_name from Supabase auth user metadata or profiles table
    const meta = user?.user_metadata;
    if (meta?.full_name) {
      setUserFullName(meta.full_name);
      return;
    }
    // Fallback: try extracting from email
    if (user?.email) {
      const namePart = user.email.split('@')[0];
      setUserFullName(namePart.charAt(0).toUpperCase() + namePart.slice(1));
    }
  };

  // ============================================================
  // CAMERA VIEW: Capture photo + AI processing
  // ============================================================
  const handleCaptureAndProcess = async () => {
    if (isProcessingImage || !cameraRef.current) return;

    setIsProcessingImage(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Speech.speak('Scanning surroundings. Please hold still.');

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: false,
      });

      // Navigate back to chat immediately so user sees progress there
      setViewMode(VIEW.CHAT);

      // Add user's image capture message
      const userCaptureMsg = {
        id: `capture-${Date.now()}`,
        role: 'user',
        content: '📷 Captured an image',
        timestamp: new Date().toISOString(),
        imageUri: photo.uri,
      };
      setMessages((prev) => [...prev, userCaptureMsg]);

      // Add "processing" placeholder
      const processingId = `processing-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: processingId,
          role: 'assistant',
          content: 'Analyzing your image...',
          timestamp: new Date().toISOString(),
          isProcessingPlaceholder: true,
        },
      ]);

      // Call backend vision pipeline
      const result = await processImage(user.id, photo.uri);

      // Remove placeholder and add real response
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== processingId)
          .concat([
            {
              id: `vision-${Date.now()}`,
              role: 'assistant',
              content: result.description || 'Image processed successfully.',
              timestamp: new Date().toISOString(),
              memoryId: result.memory_id || null,
              objects: result.objects || [],
            },
          ])
      );

      // Speak the description
      const desc = result.description || 'Image processed successfully.';
      Speech.speak(desc, { rate: 0.85 });

    } catch (error) {
      console.error('Capture/processing error:', error);
      setViewMode(VIEW.CHAT);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: "Sorry, I couldn't process that image. Please check your connection and try again.",
          timestamp: new Date().toISOString(),
        },
      ]);
      Speech.speak('Error processing image. Please try again.');
    } finally {
      setIsProcessingImage(false);
    }
  };

  // ============================================================
  // AUDIO RECORDING (Expo Go compatible — sends to backend for STT)
  // ============================================================
  const startRecording = async () => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Speech.speak('Microphone permission is required.');
        return;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      Speech.speak('Recording...');
    } catch (error) {
      console.error('Recording start error:', error);
      Speech.speak('Could not start recording.');
    }
  };

  const stopRecordingAndSend = async () => {
    if (!recorder.isRecording) return;

    setIsRecording(false);
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await recorder.stop();
      const uri = recorder.uri;

      if (uri) {
        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });

        // Show voice message placeholder
        const voiceMsg = {
          id: `voice-${Date.now()}`,
          role: 'user',
          content: '🎤 Voice message',
          audioUri: uri,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, voiceMsg]);

        // Send to backend for transcription + AI response
        const result = await sendAudioMessage(user.id, base64);

        // Update bubble with transcribed text
        if (result?.audio_text) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === voiceMsg.id ? { ...msg, content: result.audio_text } : msg
            )
          );
        }

        const assistantMsg = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: result.response || result.audio_text || 'Sorry, I could not generate a response.',
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        Speech.speak(assistantMsg.content, { rate: 0.88 });
      }
    } catch (error) {
      console.error('Recording/send error:', error);
      Speech.speak("I'm sorry, I couldn't process that. Please try again.");
    } finally {
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      setLoading(false);
    }
  };

  // ============================================================
  // TEXT MESSAGE SENDING
  // ============================================================
  const handleSendText = async () => {
    const text = inputText.trim();
    if (!text || loading) return;

    setInputText('');
    setLoading(true);

    const userMsg = {
      id: `text-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const result = await sendChatMessage(user.id, text);

      const assistantMsg = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: result.response || 'Response unavailable.',
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      Speech.speak(assistantMsg.content, { rate: 0.88 });

    } catch (error) {
      console.error('Send error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: 'Connection error. Please try again.',
          timestamp: new Date().toISOString(),
        },
      ]);
      Speech.speak('Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // LOGOUT
  // ============================================================
  const handleLogout = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      if (signOut) {
        await signOut();
      }
    } catch (e) {
      console.error('Logout error:', e);
    }
  };

  // ============================================================
  // NAVIGATION HELPERS
  // ============================================================
  const goToCamera = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode(VIEW.CAMERA);
    Speech.speak('Camera view. Double-tap to take a picture. Swipe right to go back.');
  };

  const goToChat = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode(VIEW.CHAT);
  };

  // ============================================================
  // GESTURE DEFINITIONS
  // ============================================================

  // --- CHAT VIEW GESTURES ---

  // 1) Tap left edge → Go to camera
  const screenWidth = Dimensions.get('window').width;
  const chatTapLeftEdge = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd((e) => {
      // Trigger if tap is in left 25%
      if (e.x < screenWidth * 0.25) {
        goToCamera();
      }
    })
    .runOnJS(true);

  // 2) Two-finger double-tap → Logout
  const chatTwoFingerDoubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .minPointers(2) // FIXED: Changed from .numberOfTouches(2)
    .onEnd(() => {
      Speech.speak('Logging out.');
      handleLogout();
    })
    .runOnJS(true);

  // 3) Long press on mic button → Record audio
  const chatLongPressRecord = Gesture.LongPress()
    .minDuration(300)
    .onStart(() => {
      startRecording();
    })
    .onEnd(() => {
      stopRecordingAndSend();
    })
    .runOnJS(true);

  // --- CAMERA VIEW GESTURES ---

  // 1) Double-tap → Capture photo
  const cameraDoubleTap = Gesture.Tap() // FIXED: Changed from Gesture.DoubleTap()
    .numberOfTaps(2)
    .onEnd(() => {
      handleCaptureAndProcess();
    })
    .runOnJS(true);

  // 2) Swipe right → Back to chat
  const cameraSwipeRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onEnd(() => {
      goToChat();
    })
    .runOnJS(true);

  // Combine them using Exclusive so they don't fight each other
  const chatCompositeGesture = Gesture.Exclusive(
    chatTwoFingerDoubleTap,
    chatTapLeftEdge
  );

  const cameraCompositeGesture = Gesture.Exclusive(
    cameraDoubleTap,
    cameraSwipeRight
  );

  // // --- CHAT VIEW GESTURES ---

  // // 1) Tap left edge (left 25% of screen width) → Go to camera
  // const screenWidth = Dimensions.get('window').width;
  // const chatTapLeftEdge = Gesture.Tap()
  //   .numberOfTaps(1)
  //   .onEnd((e) => {
  //     // Only trigger if tap is in left 25%
  //     if (e.x < screenWidth * 0.25) {
  //       goToCamera();
  //     }
  //   })
  //   .runOnJS(true);

  // // 2) Long press on record button area (bottom-right zone) → Record audio
  // // We'll use a separate gesture detector specifically over the mic button
  // const chatLongPressRecord = Gesture.LongPress()
  //   .minDuration(300)
  //   .onStart(() => {
  //     startRecording();
  //   })
  //   .onEnd(() => {
  //     stopRecordingAndSend();
  //   })
  //   .runOnJS(true);

  // // 3) Two-finger double-tap → Logout (special gesture)
  // const chatTwoFingerDoubleTap = Gesture.Tap()
  //   .numberOfTaps(2)
  //   .minPointers(2)
  //   .onEnd(() => {
  //     Speech.speak('Logging out.');
  //     handleLogout();
  //   })
  //   .runOnJS(true);

  // // Compose chat gestures: logout has highest priority, then left-edge tap, then long-press (for mic button area only)
  // const chatCompositeGesture = Gesture.Race(
  //   chatTwoFingerDoubleTap,
  //   chatTapLeftEdge,
  // );

  // // --- CAMERA VIEW GESTURES ---

  // // 1) Double-tap → Capture photo
  // const cameraDoubleTap = Gesture.Tap()
  //   .numberOfTaps(2)
  //   .onEnd(() => {
  //     handleCaptureAndProcess();
  //   })
  //   .runOnJS(true);

  // // 2) Swipe right → Back to chat
  // const cameraSwipeRight = Gesture.Fling()
  //   .direction(Directions.RIGHT)
  //   .onEnd(() => {
  //     goToChat();
  //   })
  //   .runOnJS(true);

  // const cameraCompositeGesture = RaceOrExclusive(
  //   cameraDoubleTap,
  //   cameraSwipeRight,
  // );

  // ============================================================
  // CAMERA PERMISSION CHECK
  // ============================================================
  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera Permission Needed</Text>
        <Text style={styles.permissionText}>
          EyeDentify uses the camera to describe your surroundings.
          Camera data is processed securely and never stored without permission.
        </Text>
        <View style={styles.permissionButtonWrapper}>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={() => requestPermission()}
            accessible={true}
            accessibilityLabel="Grant camera permission"
          >
            <Text style={styles.permissionButtonText}>Enable Camera</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => setViewMode(VIEW.CHAT)}
          accessible={true}
          accessibilityLabel="Use app without camera"
        >
          <Text style={styles.skipButtonText}>Use without camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ============================================================
  // RENDER: CHAT HISTORY ITEM
  // ============================================================
  const renderMessageItem = ({ item }) => {
    const isUser = item.role === 'user';

    if (item.isProcessingPlaceholder) {
      return (
        <View style={[styles.messageBubble, styles.processingBubble]}>
          <ActivityIndicator size="small" color="#6C63FF" />
          <Text style={styles.processingText}>{item.content}</Text>
        </View>
      );
    }

    return (
      // <View
      //   style={[
      //     styles.messageBubble,
      //     isUser ? styles.userBubble : styles.assistantBubble,
      //   ]}
      //   accessible={true}
      //   accessibilityLabel={`${isUser ? 'You' : 'EyeDentify'}: ${item.content}`}
      //   accessibilityRole="article"
      // >
      <View
        style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
        accessible={true}
        accessibilityLabel={`${isUser ? 'You' : 'EyeDentify'}: ${item.content}`}
        // FIX: Change "article" to "text" or remove it entirely
        accessibilityRole="text" 
      >
        {/* Show captured image thumbnail for user image captures */}
        {item.imageUri && (
          <Image
            source={{ uri: item.imageUri }}
            style={styles.capturedImageThumbnail}
            accessible={true}
            accessibilityLabel="Captured image"
          />
        )}
        <Text
          style={[
            styles.messageText,
            isUser ? styles.userText : styles.assistantText,
          ]}
        >
          {item.content}
        </Text>

        {/* Voice playback button */}
        {item.audioUri && (
          <TouchableOpacity
            style={styles.voicePlayButton}
            onPress={() => handlePlayVoice(item.audioUri)}
            accessible={true}
            accessibilityLabel="Play voice message"
            accessibilityRole="button"
          >
            <Text style={styles.voicePlayText}>▶︎ Play voice</Text>
          </TouchableOpacity>
        )}

        {/* Show detected objects if present */}
        {item.objects && item.objects.length > 0 && (
          <Text style={styles.objectsText}>
            Objects detected: {item.objects.map((o) => o.label || o).join(', ')}
          </Text>
        )}

        <Text style={styles.timestamp}>
          {item.timestamp
            ? new Date(item.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : ''}
        </Text>
      </View>
    );
  };

  // ============================================================
  // MAIN RENDER
  // ============================================================
  return (
    <View style={styles.container}>
      {/* ====== CHAT HISTORY VIEW ====== */}
      {viewMode === VIEW.CHAT && (
        <GestureDetector gesture={chatCompositeGesture}>
          <SafeAreaView style={styles.chatContainer} edges={['top', 'bottom']}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.appTitle}>EyeDentify</Text>
                <Text style={styles.headerHint}>2-finger double-tap to logout</Text>
              </View>
              <TouchableOpacity
                onPress={handleLogout}
                style={styles.logoutButton}
                accessible={true}
                accessibilityLabel="Logout button"
                accessibilityHint="Double tap to log out"
              >
                <Text style={styles.logoutText}>Logout</Text>
              </TouchableOpacity>
            </View>

            {/* Messages + Input — keyboard height pushes content up */}
            <View style={{ flex: 1 }}>
              {/* Messages List */}
              <View style={styles.messagesArea}>
              <FlatList
                ref={flatListRef}
                data={messages}
                renderItem={renderMessageItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.messagesList}
                showsVerticalScrollIndicator={false}
                accessible={true}
                accessibilityLabel="Chat messages"
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>
                      No messages yet. Tap the left side of screen to open camera and capture something!
                    </Text>
                    <Text style={styles.emptyHint}>
                      Or type a message below to chat with EyeDentify.
                    </Text>
                  </View>
                }
              />

              {/* Loading / Thinking indicator */}
              {(loading || isRecording) && (
                <View style={styles.typingIndicator}>
                  <ActivityIndicator size="small" color="#6C63FF" />
                  <Text style={styles.typingText}>
                    {isRecording ? 'Listening...' : 'Thinking...'}
                  </Text>
                </View>
              )}
            </View>

            {/* Bottom Input Bar */}
            <View style={styles.bottomBar}>
                {/* Left edge hint */}
                <TouchableOpacity
                  style={styles.cameraHintButton}
                  onPress={goToCamera}
                  activeOpacity={0.7}
                  accessible={true}
                  accessibilityLabel="Open camera to take a photo"
                  accessibilityHint="Tap left side of screen or here to open camera"
                >
                  <Text style={styles.cameraIcon}>📷</Text>
                </TouchableOpacity>

                {/* Text Input */}
                <TextInput
                  style={styles.textInput}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Ask anything..."
                  placeholderTextColor="#666"
                  editable={!loading}
                  maxLength={500}
                  returnKeyType="send"
                  onSubmitEditing={handleSendText}
                  blurOnSubmit={false}
                  accessible={true}
                  accessibilityLabel="Message input field"
                  accessibilityHint="Type your question and press enter to send"
                />

                {/* Long-press to Record Button */}
                <GestureDetector gesture={chatLongPressRecord}>
                  <View
                    style={[
                      styles.recordButton,
                      isRecording && styles.recordButtonActive,
                    ]}
                    accessible={true}
                    accessibilityLabel={
                      isRecording
                        ? 'Recording... Release to send'
                        : 'Press and hold to record a voice message'
                    }
                    accessibilityRole="button"
                  >
                    <Text style={styles.recordButtonText}>
                      {isRecording ? '●' : '🎤'}
                    </Text>
                  </View>
                </GestureDetector>

                {/* Send Button */}
                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    (!inputText.trim() || loading) && styles.sendButtonDisabled,
                  ]}
                  onPress={handleSendText}
                  disabled={!inputText.trim() || loading}
                  activeOpacity={0.7}
                  accessible={true}
                  accessibilityLabel="Send message"
                  accessibilityRole="button"
                >
                  <Text style={styles.sendButtonText}>→</Text>
                </TouchableOpacity>
              </View>

              {/* Gesture guide bar at very bottom */}
              <View style={styles.guideBar}>
                <Text style={styles.guideText}>
                  ← Tap left: Camera &nbsp;|&nbsp; 🎤 Hold: Talk &nbsp;|&nbsp; 👆👆 2-finger: Logout
                </Text>
              </View>
            </View>
          </SafeAreaView>
        </GestureDetector>
      )}

      {/* ====== CAMERA VIEW ====== */}
      {viewMode === VIEW.CAMERA && (
        <GestureDetector gesture={cameraCompositeGesture}>
          <View style={styles.cameraContainer}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              ref={cameraRef}
              facing="back"
              mute={false}
            />

            {/* Camera UI Overlay */}
            <View style={styles.cameraOverlay} pointerEvents="box-none">
              {/* Top instruction bar */}
              <View style={styles.cameraTopBar}>
                <Text style={styles.cameraInstruction}>
                  Double-tap to capture &nbsp;|&nbsp; Swipe right → Back
                </Text>
              </View>

              {/* Center targeting hint */}
              {!isProcessingImage && (
                <View style={styles.cameraCenterHint}>
                  <View style={styles.targetReticle} />
                  <Text style={styles.cameraHintText}>
                    Point at what you want to see, then double-tap
                  </Text>
                </View>
              )}

              {/* Processing overlay */}
              {isProcessingImage && (
                <View style={styles.processingOverlay}>
                  <ActivityIndicator size="large" color="#FFF" />
                  <Text style={styles.processingOverlayText}>
                    Analyzing image...
                  </Text>
                </View>
              )}

              {/* Bottom swipe-back hint */}
              <View style={styles.cameraBottomHint}>
                <Text style={styles.swipeBackText}>← Swipe right to go back →</Text>
              </View>
            </View>
          </View>
        </GestureDetector>
      )}
    </View>
  );
}

// ============================================================
// HELPER: RaceOrExclusive - combine gestures properly
// For RNGH v2+, we need to handle gesture composition carefully
// ============================================================
function RaceOrExclusive(...gestures) {
  // Use Exclusive to prevent multiple gestures firing simultaneously
  return Gesture.Exclusive(...gestures);
}

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  // ---- Shared ----
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0F',
  },

  // ---- Permission Screen ----
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    backgroundColor: '#0A0A0F',
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 15,
    color: '#8E8EA0',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  permissionButtonWrapper: {
    marginBottom: 14,
  },
  permissionButton: {
    backgroundColor: '#6C63FF',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '700',
  },
  skipButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  skipButtonText: {
    color: '#6C63FF',
    fontSize: 15,
    fontWeight: '600',
  },

  // ---- Chat View ----
  chatContainer: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: 'rgba(108,99,255,0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(108,99,255,0.15)',
  },
  headerLeft: {},
  appTitle: {
    color: '#6C63FF',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  headerHint: {
    color: '#555',
    fontSize: 11,
    marginTop: 2,
  },
  logoutButton: {
    backgroundColor: 'rgba(255,60,60,0.15)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,60,60,0.35)',
  },
  logoutText: {
    color: '#FF6B6B',
    fontSize: 13,
    fontWeight: '700',
  },

  // Messages area
  messagesArea: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyText: {
    color: '#666',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  emptyHint: {
    color: '#444',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },

  // Message bubbles
  messageBubble: {
    maxWidth: '82%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    marginBottom: 8,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#6C63FF',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(30,30,45,0.95)',
    borderBottomLeftRadius: 4,
  },
  processingBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(108,99,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(108,99,255,0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  processingText: {
    color: '#6C63FF',
    fontSize: 13,
    fontStyle: 'italic',
    marginLeft: 8,
  },
  capturedImageThumbnail: {
    width: 180,
    height: 135,
    borderRadius: 10,
    marginBottom: 6,
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  userText: {
    color: '#FFF',
  },
  assistantText: {
    color: '#E0E0E0',
  },
  objectsText: {
    color: '#AAA',
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
  timestamp: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.25)',
    marginTop: 4,
    textAlign: 'right',
  },
  voicePlayButton: {
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  voicePlayText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },

  // Typing indicator
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 14,
  },
  typingText: {
    color: '#8E8EA0',
    fontSize: 13,
    marginLeft: 8,
    fontStyle: 'italic',
  },

  // Bottom input bar
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 6,
    paddingTop: 6,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  cameraHintButton: {
    width: 42,
    height: 42,
    backgroundColor: 'rgba(108,99,255,0.15)',
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
  },
  cameraIcon: {
    fontSize: 18,
  },
  textInput: {
    flex: 1,
    maxHeight: 90,
    minHeight: 42,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    marginRight: 6,
  },
  recordButton: {
    width: 46,
    height: 42,
    backgroundColor: 'rgba(255,107,107,0.15)',
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  recordButtonActive: {
    backgroundColor: 'rgba(255,60,60,0.4)',
    borderWidth: 2,
    borderColor: '#FF4444',
  },
  recordButtonText: {
    fontSize: 18,
  },
  sendButton: {
    width: 42,
    height: 42,
    backgroundColor: '#6C63FF',
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.3,
  },
  sendButtonText: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: 'bold',
  },

  // Gesture guide bar
  guideBar: {
    paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  guideText: {
    color: '#444',
    fontSize: 11,
  },

  // ---- Camera View ----
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  cameraTopBar: {
    paddingTop: 50,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  cameraInstruction: {
    color: '#FFF',
    fontSize: 15,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    letterSpacing: 0.5,
  },
  cameraCenterHint: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  targetReticle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    marginBottom: 20,
  },
  cameraHintText: {
    color: '#FFF',
    fontSize: 17,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 23,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingOverlayText: {
    color: '#FFF',
    fontSize: 18,
    marginTop: 16,
    fontWeight: '600',
  },
  cameraBottomHint: {
    paddingBottom: 50,
    alignItems: 'center',
  },
  swipeBackText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 15,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 16,
  },
});
