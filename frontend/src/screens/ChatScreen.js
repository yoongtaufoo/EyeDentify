/**
 * ChatScreen.js - Main chat interface for EyeDentify
 *
 * LIGHT THEME UI - Matches website style (white bg, warm accent colors)
 *
 * DUAL-VIEW ARCHITECTURE:
 *   1) Chat History View (default) - messages, text input, audio recording
 *   2) Camera View - live camera preview, double-tap to capture
 *
 * GESTURE MAP:
 *   ──────────────────────────────────────────────────────
 *   CHAT VIEW:
 *     • Tap LEFT edge (left 25%)    → Toggle Camera View (open/close)
 *     • Swipe LEFT                  → Go to Memories tab
 *     • Swipe RIGHT                 → Go to Home tab
 *     • Two-finger double-tap       → Logout
 *     • Long-press mic button       → Record audio (release to send)
 *     • Type text + tap Send         → Send text message
 *
 *   CAMERA VIEW:
 *     • Double-tap anywhere          → Take photo → AI process → back to Chat
 *     • Tap left edge                → Close camera → back to Chat
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

// Accessibility helper: speaks when an element receives focus (Tab / TalkBack)
const speakOnFocus = (message) => {
  Speech.stop();
  setTimeout(() => Speech.speak(message), 100);
};

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ChatScreen({ navigation }) {
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
  const greetingTimeoutRef = useRef(null);
  const hasPlayedGesturesRef = useRef(false);

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

  // Welcome + gesture guide once when chat view is first shown
  // useEffect(() => {
  //   if (!hasWelcomed && userFullName && viewMode === VIEW.CHAT) {
  //     setHasWelcomed(true);
  //     const greeting = `Welcome back, ${userFullName}. EyeDentify ready.`;
  //     const gestures =
  //       'Gesture guide. Tap the left side of screen to open or close camera. ' +
  //       'Swipe left to go to Memories. Swipe right to go to Home. ' +
  //       'Hold the microphone button to record and send a voice message. ' +
  //       'Two-finger double-tap anywhere to log out.';
  //     Speech.speak(greeting, { rate: 0.9 });
  //     setTimeout(() => Speech.speak(gestures, { rate: 0.85 }), 2000);
  //   }
  // }, [hasWelcomed, userFullName, viewMode]);

  // useEffect(() => {
  //   if (!hasWelcomed && userFullName && viewMode === VIEW.CHAT) {
  //     setHasWelcomed(true);
  //     const greeting = `Welcome back, ${userFullName}. EyeDentify ready.`;
  //     const gestures =
  //       'Gesture guide. Tap the left side of screen to open or close camera. ' +
  //       'Swipe left to go to Memories. Swipe right to go to Home. ' +
  //       'Hold the microphone button to record and send a voice message. ' +
  //       'Two-finger double-tap anywhere to log out.';
      
  //     Speech.stop(); // Stop any lingering speech
  //     Speech.speak(greeting, { rate: 0.9 });
      
  //     // Capture the timeout ID into the ref
  //     greetingTimeoutRef.current = setTimeout(() => {
  //       Speech.speak(gestures, { rate: 0.85 });
  //     }, 2000);
  //   }

  //   // Clear timeout if the component unmounts unexpectedly
  //   return () => {
  //     if (greetingTimeoutRef.current) clearTimeout(greetingTimeoutRef.current);
  //   };
  // }, [hasWelcomed, userFullName, viewMode]);

  // useEffect(() => {
  //   const playIntroSpeech = () => {
  //     // Ensure we are explicitly in the chat view and have the profile loaded
  //     if (userFullName && viewMode === VIEW.CHAT) {
  //       const greeting = `Welcome back, ${userFullName}. EyeDentify ready.`;
  //       const gestures =
  //         'Gesture guide. Tap the left side of screen to open or close camera. ' +
  //         'Swipe left to go to Memories. Swipe right to go to Home. ' +
  //         'Hold the microphone button to record and send a voice message. ' +
  //         'Two-finger double-tap anywhere to log out.';
        
  //       // Stop any current screen reading cleanly
  //       Speech.stop(); 
  //       Speech.speak(greeting, { rate: 0.9 });
        
  //       // Reset any existing text-to-speech timer before creating a new one
  //       if (greetingTimeoutRef.current) {
  //         clearTimeout(greetingTimeoutRef.current);
  //       }
        
  //       // Schedule the gesture rundown
  //       greetingTimeoutRef.current = setTimeout(() => {
  //         Speech.speak(gestures, { rate: 0.85 });
  //       }, 2000);
  //     }
  //   };

  //   // 1. Trigger speech immediately if the viewMode state toggles back to CHAT (e.g., closing camera)
  //   if (viewMode === VIEW.CHAT) {
  //     playIntroSpeech();
  //   }

  //   // 2. Trigger speech whenever the user clicks this tab from Home or Memories
  //   const unsubscribe = navigation.addListener('focus', () => {
  //     playIntroSpeech();
  //   });

  //   // Clean up timers and listeners when navigating away
  //   return () => {
  //     unsubscribe();
  //     if (greetingTimeoutRef.current) {
  //       clearTimeout(greetingTimeoutRef.current);
  //     }
  //   };
  // }, [navigation, userFullName, viewMode]);

  useEffect(() => {
    const playIntroSpeech = () => {
      if (userFullName && viewMode === VIEW.CHAT) {
        // Clear any lingering or racing gesture timers immediately
        if (greetingTimeoutRef.current) {
          clearTimeout(greetingTimeoutRef.current);
          greetingTimeoutRef.current = null;
        }

        // Wipe the slate clean before talking
        Speech.stop(); 

        if (!hasPlayedGesturesRef.current) {
          // SCENARIO A: The very first load. Play full greeting + schedule gestures.
          const greeting = `Welcome back, ${userFullName}. EyeDentify ready.`;
          const gestures =
            'Gesture guide. Tap the left side of screen to open or close camera. ' +
            'Swipe left to go to Memories. Swipe right to go to Home. ' +
            'Hold the microphone button to record and send a voice message. ' +
            'Two-finger double-tap anywhere to log out.';
          
          Speech.speak(greeting, { rate: 0.9 });
          
          greetingTimeoutRef.current = setTimeout(() => {
            Speech.speak(gestures, { rate: 0.85 });
            hasPlayedGesturesRef.current = true; // Mark as played ONLY after it actually triggers
          }, 2000);

        } else {
          // SCENARIO B: Returning user switching tabs. Just a fast notification.
          Speech.speak('Chat active.', { rate: 0.95 });
        }
      }
    };

    // 1. Check instantly if view mode flips back from camera
    if (viewMode === VIEW.CHAT) {
      playIntroSpeech();
    }

    // 2. Listen for navigation tab selections
    const unsubscribe = navigation.addListener('focus', () => {
      playIntroSpeech();
    });

    return () => {
      unsubscribe();
      if (greetingTimeoutRef.current) {
        clearTimeout(greetingTimeoutRef.current);
      }
    };
  }, [navigation, userFullName, viewMode]);

  // Auto-scroll to bottom on new messages
  // Guaranteed auto-scroll on fresh data loading AND tab switching
  useEffect(() => {
    // Function to execute the scroll safely
    const scrollToBottom = () => {
      if (messages.length > 0 && flatListRef.current) {
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: false }); // 'false' makes it snap instantly without an ugly sliding delay on load
        }, 250); // 250ms gives React Native enough time to compute the full list layout height
      }
    };

    // 1. Run it immediately if messages just loaded or changed
    scrollToBottom();

    // 2. Run it whenever the user clicks or navigates back onto the Chat Tab
    const unsubscribe = navigation.addListener('focus', () => {
      scrollToBottom();
    });

    return unsubscribe; // Clean up listener on unmount
  }, [navigation, messages]);
  // useEffect(() => {
  //   if (messages.length > 0 && flatListRef.current) {
  //     setTimeout(() => {
  //       flatListRef.current.scrollToEnd({ animated: true });
  //     }, 150);
  //   }
  // }, [messages]);

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
        timestamp: msg.created_at || undefined,
        imageUri: msg.image_uri || null,
        memoryId: msg.memory_id || null,
      }));
      setMessages(formatted);
    } else if (history === null) {
      setMessages([{ 
        id: 'welcome', 
        role: 'assistant', 
        content: "I couldn't reach my brain, but I'm still here to help locally." 
      }]);
    }
    setLoading(false);
  };

  const fetchUserProfile = async () => {
    const meta = user?.user_metadata;
    if (meta?.full_name) {
      setUserFullName(meta.full_name);
      return;
    }
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
        quality: 0.3,
        base64: false,
        skipProcessing: true,
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

      // Speak the description — stop any previous speech first
      const desc = result.description || 'Image processed successfully.';
      Speech.stop();
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
  // AUDIO RECORDING
  // ============================================================
  const toggleRecording = async () => {
    // 1. KILL THE PENDING GESTURE GUIDE TIMER IMMEDIATELY
    if (greetingTimeoutRef.current) {
      clearTimeout(greetingTimeoutRef.current);
      greetingTimeoutRef.current = null;
    }

    // 2. STOP THE EXPO SPEECH ENGINE INSTANTLY
    Speech.stop();

    // 3. Proceed with standard recording toggle logic
    if (isRecording) {
      await stopRecordingAndSend();
    } else {
      await startRecording();
    }
  };
  // const toggleRecording = async () => {
  //   if (isRecording) {
  //     await stopRecordingAndSend();
  //   } else {
  //     await startRecording();
  //   }
  // };

  // const toggleVoiceMessage = async () => {
  //   // 1. KILL THE PENDING GESTURE GUIDE TIMER IMMEDIATELY
  //   if (greetingTimeoutRef.current) {
  //     clearTimeout(greetingTimeoutRef.current);
  //     greetingTimeoutRef.current = null;
  //   }

  //   // 2. STOP THE EXPO SPEECH ENGINE INSTANTLY
  //   Speech.stop();

  //   // 3. Stop local web speech fallback (if applicable)
  //   if ('speechSynthesis' in window) {
  //     window.speechSynthesis.cancel();
  //   }

  //   // 4. Stop high-quality backend audio stream
  //   if (activeBackendAudioRef.current) {
  //     activeBackendAudioRef.current.pause();
  //     activeBackendAudioRef.current = null;
  //   }

  //   if (isVoiceRecording) {
  //     try {
  //       setIsVoiceRecording(false);
  //       window.isRecordingVoice = false; 
        
  //       const text = await stopRecording(requireUid());
  //       if (text && text.trim()) {
  //         setInputText(text.trim());
  //         sendMessage(text.trim());
  //       }
  //     } catch (err) {
  //       console.error('[Chat] Voice error:', err);
  //       setIsVoiceRecording(false);
  //       window.isRecordingVoice = false;
  //     }
  //   } else {
  //     try {
  //       if (!isSpeechSupported()) return;
        
  //       window.isRecordingVoice = true; 
  //       setIsVoiceRecording(true);
        
  //       await startRecording();
  //     } catch {
  //       setIsVoiceRecording(false);
  //       window.isRecordingVoice = false;
  //     }
  //   }
  // };

  const startRecording = async () => {
    try {
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Speech.speak('Microphone permission is required.');
        return;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

      Speech.speak('Recording...');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 200);

      await new Promise((r) => setTimeout(r, 200));
      let attempts = 0;
      while (await Speech.isSpeakingAsync()) {
        await new Promise((r) => setTimeout(r, 150));
        if (attempts++ > 80) break;
      }

      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
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

        const voiceMsg = {
          id: `voice-${Date.now()}`,
          role: 'user',
          content: '🎤 Voice message',
          audioUri: uri,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, voiceMsg]);

        Speech.speak('Processing audio.');

        const result = await sendAudioMessage(user.id, base64);

        if (result?.audio_text) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === voiceMsg.id ? { ...msg, content: result.audio_text, transcribedText: result.audio_text } : msg
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
        Speech.stop();
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
      Speech.stop();
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
    Speech.speak('Logging out.');
    
    hasPlayedGesturesRef.current = false; // <-- Reset the safety lock here!
    
    try {
      if (signOut) await signOut();
    } catch (e) {
      console.error('Logout error:', e);
    }
  };
  // const handleLogout = async () => {
  //   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  //   Speech.speak('Logging out.');
  //   try {
  //     if (signOut) await signOut();
  //   } catch (e) {
  //     console.error('Logout error:', e);
  //   }
  // };

  // ============================================================
  // NAVIGATION HELPERS
  // ============================================================
  // const goToCamera = () => {
  //   Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  //   setViewMode(VIEW.CAMERA);
  //   Speech.speak('Camera view. Double-tap to take a picture. Tap left side to close.');
  // };

  const goToCamera = () => {
    // 1. Kill the pending welcome/gesture guide timer immediately
    if (greetingTimeoutRef.current) {
      clearTimeout(greetingTimeoutRef.current);
      greetingTimeoutRef.current = null;
    }

    // 2. Stop the Expo Speech engine instantly
    Speech.stop();

    // 3. Pause the audio player if a recorded voice message is playing
    try {
      if (player && player.playing) {
        player.pause();
      }
    } catch (err) {
      console.warn('[Camera] Failed to pause audio player:', err);
    }

    // 4. Switch view and announce camera instructions
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode(VIEW.CAMERA);
    Speech.speak('Camera view. Double-tap to take a picture. Tap left side to close.');
  };

  const goToChatFromCamera = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewMode(VIEW.CHAT);
  };

  const goToMemories = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('Memories');
    Speech.speak('Switching to Memories.');
  };

  const goToHome = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('Home');
    Speech.speak('Switching to Home.');
  };

  // ============================================================
  // GESTURE DEFINITIONS
  // ============================================================

  // --- CHAT VIEW GESTURES ---

  // 1) Tap left edge → Toggle camera (open or close)
  const screenWidth = Dimensions.get('window').width;
  const chatTapLeftEdge = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd((e) => {
      if (e.x < screenWidth * 0.25) {
        goToCamera();
      }
    })
    .runOnJS(true);

  // 2) Two-finger double-tap → Logout
  const chatTwoFingerDoubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .minPointers(2)
    .onEnd(() => { handleLogout(); })
    .runOnJS(true);

  // 3) Swipe LEFT → Go to Memories tab
  const chatSwipeLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .onEnd(() => { goToMemories(); })
    .runOnJS(true);

  // 4) Swipe RIGHT → Go to Home tab
  const chatSwipeRight = Gesture.Fling()
    .direction(Directions.RIGHT)
    .onEnd(() => { goToHome(); })
    .runOnJS(true);

  // --- CAMERA VIEW GESTURES ---

  // 1) Double-tap → Capture photo
  const cameraDoubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => { handleCaptureAndProcess(); })
    .runOnJS(true);

  // 2) Tap left edge → Close camera
  const cameraTapLeft = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd((e) => {
      if (e.x < screenWidth * 0.25) {
        goToChatFromCamera();
      }
    })
    .runOnJS(true);

  // Compose chat gestures — two-finger DT has highest priority, then flings/swipes, then tap
  const chatCompositeGesture = Gesture.Exclusive(
    chatTwoFingerDoubleTap,
    chatSwipeLeft,
    chatSwipeRight,
    chatTapLeftEdge,
  );

  const cameraCompositeGesture = Gesture.Exclusive(
    cameraDoubleTap,
    cameraTapLeft,
  );

  // ============================================================
  // CAMERA PERMISSION CHECK
  // ============================================================
  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F5A623" />
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
            focusable={true}
            accessibilityRole="button"
            accessibilityLabel="Grant camera permission"
            accessibilityHint="Tap to enable camera access"
            onFocus={() => speakOnFocus('Enable Camera button. Tap to grant camera permission.')}
          >
            <Text style={styles.permissionButtonText}>Enable Camera</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => setViewMode(VIEW.CHAT)}
          accessible={true}
          focusable={true}
          accessibilityLabel="Use app without camera"
          onFocus={() => speakOnFocus('Skip button. Tap to use app without camera.')}
        >
          <Text style={styles.skipButtonText}>Use without camera</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // // ============================================================
  // // RENDER: CHAT HISTORY ITEM
  // // ============================================================
  // const renderMessageItem = ({ item }) => {
  //   const isUser = item.role === 'user';

  //   if (item.isProcessingPlaceholder) {
  //     return (
  //       <View style={[styles.messageBubble, styles.processingBubble]}>
  //         <ActivityIndicator size="small" color="#F5A623" />
  //         <Text style={styles.processingText}>{item.content}</Text>
  //       </View>
  //     );
  //   }

  //   return (
  //     <View
  //       style={[
  //         styles.messageBubble,
  //         isUser ? styles.userBubble : styles.assistantBubble,
  //       ]}
  //       accessible={true}
  //       accessibilityLabel={`${isUser ? 'You' : 'EyeDentify'}: ${item.content}`}
  //       accessibilityRole="text" 
  //     >
  //       {/* Show captured image thumbnail for user image captures */}
  //       {item.imageUri && (
  //         <Image
  //           source={{ uri: item.imageUri }}
  //           style={styles.capturedImageThumbnail}
  //           accessible={true}
  //           accessibilityLabel="Captured image"
  //         />
  //       )}
  //       <Text
  //         style={[
  //           styles.messageText,
  //           isUser ? styles.userText : styles.assistantText,
  //         ]}
  //       >
  //         {item.content}
  //       </Text>

  //       {/* Show detected transcription text above Play Voice button */}
  //       {item.transcribedText && (
  //         <View style={styles.transcribedTextContainer}>
  //           <Text style={styles.transcribedTextLabel}>Detected:</Text>
  //           <Text style={styles.transcribedTextValue}>{item.transcribedText}</Text>
  //         </View>
  //       )}

  //       {/* Voice playback button */}
  //       {item.audioUri && (
  //         <TouchableOpacity
  //           style={styles.voicePlayButton}
  //           onPress={() => handlePlayVoice(item.audioUri)}
  //           accessible={true}
  //           focusable={true}
  //           accessibilityRole="button"
  //           accessibilityLabel="Play voice message"
  //           accessibilityHint="Double tap to listen to the voice message"
  //           onFocus={() => speakOnFocus('Play voice message button. Tap to listen to the voice message.')}
  //         >
  //           <Text style={styles.voicePlayText}>▶︎ Play voice</Text>
  //         </TouchableOpacity>
  //       )}

  //       {/* Show detected objects if present */}
  //       {item.objects && item.objects.length > 0 && (
  //         <Text style={styles.objectsText}>
  //           Objects detected: {item.objects.map((o) => o.label || o).join(', ')}
  //         </Text>
  //       )}

  //       <Text style={styles.timestamp}>
  //         {item.timestamp
  //           ? new Date(item.timestamp).toLocaleTimeString([], {
  //               hour: '2-digit',
  //               minute: '2-digit',
  //             })
  //           : ''}
  //       </Text>
  //     </View>
  //   );
  // };

  // ============================================================
  // RENDER: CHAT HISTORY ITEM
  // ============================================================

  const getDateKey = (ts) => {
    if (!ts) return null;
    const d = new Date(ts);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  };

  const formatDateSeparator = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const dStr = d.toISOString().split('T')[0];
    const nowStr = now.toISOString().split('T')[0];
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    if (dStr === nowStr) return 'Today';
    if (dStr === yesterdayStr) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
  };

  const renderDateSeparator = (date) => (
    <View style={styles.dateSeparator} key={`date-${date}`}>
      <View style={styles.dateSeparatorLine} />
      <Text style={styles.dateSeparatorText}>{formatDateSeparator(new Date(date))}</Text>
      <View style={styles.dateSeparatorLine} />
    </View>
  );

  const renderMessageItem = ({ item, index }) => {
    const isUser = item.role === 'user';

    if (item.isProcessingPlaceholder) {
      return (
        <View style={[styles.messageBubble, styles.processingBubble]}>
          <ActivityIndicator size="small" color="#F5A623" />
          <Text style={styles.processingText}>{item.content}</Text>
        </View>
      );
    }

    // Chronological Evaluation Layer
    const currentMessageDate = getDateKey(item.timestamp);
    const previousMessageDate = index > 0 ? getDateKey(messages[index - 1].timestamp) : null;
    const shouldDrawSeparator = currentMessageDate && currentMessageDate !== previousMessageDate;

    return (
      <View key={item.id} style={{ width: '100%' }}>
        {/* Render dynamic date header block whenever the day tracking shifts */}
        {shouldDrawSeparator && renderDateSeparator(currentMessageDate)}

        <TouchableOpacity
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
          activeOpacity={0.7}
          onPress={() => {
            Speech.stop();
            Speech.speak(item.content, { rate: 0.88 });
          }}
          accessible={true}
          accessibilityLabel={`${isUser ? 'You said' : 'EyeDentify replied'}: ${item.content}`}
          accessibilityRole="button"
          accessibilityHint="Double tap to hear this message spoken aloud"
        >
          {item.imageUri && (
            <Image source={{ uri: item.imageUri }} style={styles.capturedImageThumbnail} />
          )}
          <Text style={[styles.messageText, isUser ? styles.userText : styles.assistantText]}>
            {item.content}
          </Text>

          {item.transcribedText && (
            <View style={styles.transcribedTextContainer}>
              <Text style={styles.transcribedTextLabel}>Detected:</Text>
              <Text style={styles.transcribedTextValue}>{item.transcribedText}</Text>
            </View>
          )}

          {item.audioUri && (
            <TouchableOpacity style={styles.voicePlayButton} onPress={() => handlePlayVoice(item.audioUri)}>
              <Text style={styles.voicePlayText}>▶︎ Play voice</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.timestamp}>
            {item.timestamp
              ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : ''}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  // const renderMessageItem = ({ item }) => {
  //   const isUser = item.role === 'user';

  //   if (item.isProcessingPlaceholder) {
  //     return (
  //       <View style={[styles.messageBubble, styles.processingBubble]}>
  //         <ActivityIndicator size="small" color="#F5A623" />
  //         <Text style={styles.processingText}>{item.content}</Text>
  //       </View>
  //     );
  //   }

  //   return (
  //     <TouchableOpacity
  //       style={[
  //         styles.messageBubble,
  //         isUser ? styles.userBubble : styles.assistantBubble,
  //       ]}
  //       activeOpacity={0.7}
  //       onPress={() => {
  //         // Instantly stop any ongoing speech and announce the bubble text
  //         Speech.stop();
  //         Speech.speak(item.content, { rate: 0.88 });
  //       }}
  //       accessible={true}
  //       accessibilityLabel={`${isUser ? 'You said' : 'EyeDentify replied'}: ${item.content}`}
  //       accessibilityRole="button" // Changed from "text" to "button" to flag it as interactable
  //       accessibilityHint="Double tap to hear this message spoken aloud"
  //     >
  //       {/* Show captured image thumbnail for user image captures */}
  //       {item.imageUri && (
  //         <Image
  //           source={{ uri: item.imageUri }}
  //           style={styles.capturedImageThumbnail}
  //           accessible={true}
  //           accessibilityLabel="Captured image"
  //         />
  //       )}
  //       <Text
  //         style={[
  //           styles.messageText,
  //           isUser ? styles.userText : styles.assistantText,
  //         ]}
  //       >
  //         {item.content}
  //       </Text>

  //       {/* Show detected transcription text above Play Voice button */}
  //       {item.transcribedText && (
  //         <View style={styles.transcribedTextContainer}>
  //           <Text style={styles.transcribedTextLabel}>Detected:</Text>
  //           <Text style={styles.transcribedTextValue}>{item.transcribedText}</Text>
  //         </View>
  //       )}

  //       {/* Voice playback button */}
  //       {item.audioUri && (
  //         <TouchableOpacity
  //           style={styles.voicePlayButton}
  //           onPress={() => handlePlayVoice(item.audioUri)}
  //           accessible={true}
  //           focusable={true}
  //           accessibilityRole="button"
  //           accessibilityLabel="Play voice message"
  //           accessibilityHint="Double tap to listen to the voice message"
  //           onFocus={() => speakOnFocus('Play voice message button. Tap to listen to the voice message.')}
  //         >
  //           <Text style={styles.voicePlayText}>▶︎ Play voice</Text>
  //         </TouchableOpacity>
  //       )}

  //       {/* Show detected objects if present */}
  //       {item.objects && item.objects.length > 0 && (
  //         <Text style={styles.objectsText}>
  //           Objects detected: {item.objects.map((o) => o.label || o).join(', ')}
  //         </Text>
  //       )}

  //       <Text style={styles.timestamp}>
  //         {item.timestamp
  //           ? new Date(item.timestamp).toLocaleTimeString([], {
  //               hour: '2-digit',
  //               minute: '2-digit',
  //             })
  //           : ''}
  //       </Text>
  //     </TouchableOpacity>
  //   );
  // };

  // ============================================================
  // MAIN RENDER
  // ============================================================
  return (
    <View style={styles.container}>
      {/* ====== CHAT HISTORY VIEW ====== */}
      {viewMode === VIEW.CHAT && (
        <GestureDetector gesture={chatCompositeGesture}>
          <SafeAreaView style={styles.chatContainer} edges={['top', 'bottom']}>
            {/* Header - matches web light theme */}
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
              <Text style={styles.headerHint}>2-finger double-tap to logout</Text>
            </View>

            {/* Messages + Input */}
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
                    <Text style={styles.emptyIcon}>{'\u{1F441}\uFE0F'}</Text>
                    <Text style={styles.emptyTitle}>Welcome to EyeDentify</Text>
                    <Text style={styles.emptyText}>
                      Your AI vision assistant is ready to help you identify objects, read text, describe scenes, and more.
                    </Text>
                    <Text style={styles.emptyHint}>Tap the left side of screen to open camera!</Text>
                  </View>
                }
              />

              {/* Loading / Thinking indicator */}
              {(loading || isRecording) && (
                <View style={styles.typingIndicator}>
                  <ActivityIndicator size="small" color="#F5A623" />
                  <Text style={styles.typingText}>
                    {isRecording ? 'Listening...' : 'Thinking...'}
                  </Text>
                </View>
              )}
            </View>

            {/* Bottom Input Bar - light theme like web */}
            <View style={styles.bottomBar}>
              {/* Left edge hint - camera toggle */}
              <TouchableOpacity
                style={styles.cameraHintButton}
                onPress={goToCamera}
                activeOpacity={0.7}
                accessible={true}
                focusable={true}
                accessibilityRole="button"
                accessibilityLabel="Toggle camera"
                accessibilityHint="Tap to open camera and take a photo"
                onFocus={() => speakOnFocus('Camera button. Tap to open camera and take a photo.')}
              >
                <Text style={styles.cameraIcon}>📷</Text>
              </TouchableOpacity>

              {/* Text Input */}
              <TextInput
                style={styles.textInput}
                value={inputText}
                onChangeText={setInputText}
                placeholder="Ask anything..."
                placeholderTextColor="#999"
                editable={!loading}
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={handleSendText}
                blurOnSubmit={false}
                accessible={true}
                accessibilityLabel="Message input"
                accessibilityHint="Type your question and press enter to send"
                onFocus={() => speakOnFocus('Message input. Type your question and press enter to send.')}
              />

              {/* Tap to Record / Stop Button */}
              <TouchableOpacity
                style={[
                  styles.recordButton,
                  isRecording ? styles.recordButtonActive : styles.recordButtonReady,
                ]}
                onPress={toggleRecording}
                disabled={loading}
                activeOpacity={0.7}
                accessible={true}
                focusable={true}
                accessibilityRole="button"
                accessibilityLabel={
                  isRecording
                    ? 'Stop recording button'
                    : 'Voice record button'
                }
                accessibilityHint={
                  isRecording
                    ? 'Tap to stop recording and send'
                    : 'Tap to start recording a voice message'
                }
                onFocus={() => speakOnFocus(isRecording
                  ? 'Stop button. Tap to stop recording and send.'
                  : 'Voice record button. Tap to start recording a voice message.')}
              >
                <Text style={styles.recordButtonText}>
                  {isRecording ? '■' : '🎤'}
                </Text>
              </TouchableOpacity>

              {/* Send Button - warm orange gradient like web */}
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  (!inputText.trim() || loading) && styles.sendButtonDisabled,
                ]}
                onPress={handleSendText}
                disabled={!inputText.trim() || loading}
                activeOpacity={0.7}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Send message"
                accessibilityHint="Tap to send your typed message"
              >
                <Text style={[styles.sendButtonText, (!inputText.trim() || loading) && styles.sendButtonTextDisabled]}>→</Text>
              </TouchableOpacity>
            </View>

            {/* Gesture guide bar at very bottom */}
            <View style={styles.guideBar}>
              <Text style={styles.guideText}>
                Tap left: Camera &nbsp;|&nbsp; Tap 🎤: Talk &nbsp;|&nbsp; 2-finger: Logout &nbsp;|&nbsp; Swipe: Tabs
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

            {/* Camera UI Overlay - light themed hints */}
            <View style={styles.cameraOverlay} pointerEvents="box-none">
              {/* Top instruction bar */}
              <View style={styles.cameraTopBar}>
                <Text style={styles.cameraInstruction}>
                  Double-tap to capture &nbsp;|&nbsp; Tap left to close
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
                  <ActivityIndicator size="large" color="#F5A623" />
                  <Text style={styles.processingOverlayText}>
                    Analyzing image...
                  </Text>
                </View>
              )}

              {/* Bottom hint */}
              <View style={styles.cameraBottomHint}>
                <Text style={styles.swipeBackText}>← Tap left side to close →</Text>
              </View>
            </View>
          </View>
        </GestureDetector>
      )}
    </View>
  );
}

// ============================================================
// STYLES - LIGHT THEME (matches website UI)
// ============================================================
const styles = StyleSheet.create({
  // ---- Shared ----
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7F7F7',
  },

  // ---- Permission Screen ----
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    backgroundColor: '#F7F7F7',
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#222',
    marginBottom: 16,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  permissionButtonWrapper: {
    marginBottom: 14,
  },
  permissionButton: {
    backgroundColor: '#F5A623',
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
    color: '#F5A623',
    fontSize: 15,
    fontWeight: '600',
  },

  // ---- Chat View - Light Theme ----
  chatContainer: {
    flex: 1,
    backgroundColor: '#F7F7F7',
    paddingBottom: 60
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
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
  headerHint: {
    color: '#AAA',
    fontSize: 11,
    marginTop: 2,
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
  emptyIcon: {
    fontSize: 44,
    marginBottom: 14,
    opacity: 0.45,
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#999',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    color: '#AAA',
    fontSize: 13.5,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: 4,
  },
  emptyHint: {
    color: '#BBB',
    fontSize: 12,
    textAlign: 'center',
  },

  // Message bubbles - light theme
  messageBubble: {
    maxWidth: '82%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    marginBottom: 8,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#F0F0F0',
    borderBottomRightRadius: 6,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FDF3D8',
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.15)',
  },
  processingBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF8EE',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  processingText: {
    color: '#F5A623',
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
    color: '#222',
  },
  assistantText: {
    color: '#333',
  },
  objectsText: {
    color: '#AAA',
    fontSize: 11,
    marginTop: 4,
    fontStyle: 'italic',
  },
  timestamp: {
    fontSize: 10,
    color: '#CCC',
    marginTop: 4,
    textAlign: 'right',
  },
  voicePlayButton: {
    marginTop: 8,
    backgroundColor: 'rgba(245,166,35,0.15)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  voicePlayText: {
    color: '#B8860B',
    fontSize: 14,
    fontWeight: '600',
  },
  transcribedTextContainer: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(245,166,35,0.1)',
    borderRadius: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(245,166,35,0.2)',
  },
  transcribedTextLabel: {
    color: '#F5A623',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 2,
  },
  transcribedTextValue: {
    color: '#555',
    fontSize: 14,
    lineHeight: 20,
  },

  // Typing indicator
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingLeft: 14,
  },
  typingText: {
    color: '#888',
    fontSize: 13,
    marginLeft: 8,
    fontStyle: 'italic',
  },

  // Bottom input bar - light theme
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 4,
    paddingTop: 6,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  cameraHintButton: {
    width: 42,
    height: 42,
    backgroundColor: '#FFF8EE',
    borderRadius: 21,
    borderWidth: 1,
    borderColor: '#F5A62333',
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
    backgroundColor: '#F5F5F5',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 10,
    color: '#222',
    fontSize: 15,
    borderWidth: 1.5,
    borderColor: '#EEE',
    marginRight: 6,
  },
  recordButton: {
    width: 46,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  recordButtonActive: {
    backgroundColor: '#FFF0EE',
    borderWidth: 2,
    borderColor: '#D94A4A',
  },
  recordButtonReady: {
    backgroundColor: '#E8F8EC',
    borderColor: '#4CAF50',
  },
  recordButtonText: {
    fontSize: 18,
  },
  sendButton: {
    width: 48,
    height: 42,
    backgroundColor: '#F5A623',
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.35,
  },
  sendButtonText: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: 'bold',
  },
  sendButtonTextDisabled: {
    color: '#AAA',
  },

  // Gesture guide bar
  guideBar: {
    paddingVertical: 3,
    backgroundColor: '#FAFAFA',
    alignItems: 'center',
  },
  guideText: {
    color: '#AAA',
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
    backgroundColor: 'rgba(0,0,0,0.75)',
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
    paddingBottom: 100,
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
  // Date Separator Elements
  dateSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 20,
    paddingHorizontal: 14,
    width: '100%',
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E5E5',
  },
  dateSeparatorText: {
    color: '#999999',
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 16,
    letterSpacing: 0.3,
  },
});
