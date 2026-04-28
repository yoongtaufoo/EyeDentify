import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { GestureDetector, Gesture, Directions } from 'react-native-gesture-handler';
import * as Speech from 'expo-speech';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../contexts/AuthContext';
import BrailleInput from '../components/BrailleInput';
import { startListeningFlow } from '../utils/audioHandler';

// View modes
const VIEW = {
  MODE_PICKER: 'MODE_PICKER',
  EMAIL_INPUT: 'EMAIL_INPUT',
  BIOMETRIC: 'BIOMETRIC',
};

export default function RegisterScreen({ navigation }) {
  const { signUpPasswordless, setInputMode, inputMode } = useAuth();
  const [view, setView] = useState(VIEW.MODE_PICKER);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  // Welcome message on mount
  useEffect(() => {
    Speech.speak("Registration. Choose input method. Tap 1 for Audio, 2 for Braille, 3 for Keyboard. Swipe down for Login.");
  }, []);

  // Handle mode selection
  const selectMode = (mode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setInputMode(mode);
    setView(VIEW.EMAIL_INPUT);
    
    if (mode === 'audio') {
      Speech.speak("Audio mode selected. Please speak your email address.");
      // Start audio transcription flow
      startListeningFlow("temp_user", (transcribedEmail) => {
        setEmail(transcribedEmail);
      });
    } else if (mode === 'braille') {
      Speech.speak("Braille mode selected. Use the dot grid to enter your email.");
    } else {
      Speech.speak("Keyboard mode selected. Tap the input field to type your email.");
    }
  };

  // Return to mode selection
  const returnToModePicker = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setView(VIEW.MODE_PICKER);
    Speech.speak("Returning to mode selection.");
  };

  // Finalize registration with biometrics
  const handleFinalize = async () => {
    if (!email || email.length < 3) {
      Speech.speak("Please enter a valid email address.");
      return;
    }

    Speech.speak("Place your finger on the scanner to secure your account.");
    const result = await LocalAuthentication.authenticateAsync({ 
      promptMessage: 'Secure Account' 
    });
    
    if (result.success) {
      setLoading(true);
      try {
        await signUpPasswordless(email, "New User", inputMode);
        Speech.speak("Account secured. Welcome to EyeDentify.");
        // No manual navigation needed! 
        // AuthContext will update 'user', and App.js will auto-switch to Chat.
      } catch (error) {
        console.error('Registration error:', error);
        Speech.speak("Registration failed. Please try again.");
      } finally {
        setLoading(false);
      }
    } else {
      Speech.speak("Authentication cancelled.");
    }
  };

  // ============================================================
  // GESTURE DEFINITIONS
  // ============================================================

  // Swipe down to go to Login screen (always available)
  const swipeDown = Gesture.Fling()
    .direction(Directions.DOWN)
    .onEnd(() => {
      // Use navigate instead of replace to avoid navigation errors
      navigation.navigate('Login');
      Speech.speak("Switching to Login.");
    })
    .runOnJS(true);

  // Swipe left to return to mode selection (available in EMAIL_INPUT view)
  const swipeLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .onEnd(() => {
      if (view === VIEW.EMAIL_INPUT) {
        returnToModePicker();
      }
    })
    .runOnJS(true);

  // Tap gestures for mode selection (only in MODE_PICKER view)
  const tap1 = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (view === VIEW.MODE_PICKER) {
        selectMode('audio');
      }
    })
    .runOnJS(true);

  const tap2 = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (view === VIEW.MODE_PICKER) {
        selectMode('braille');
      }
    })
    .runOnJS(true);

  const tap3 = Gesture.Tap()
    .numberOfTaps(3)
    .onEnd(() => {
      if (view === VIEW.MODE_PICKER) {
        selectMode('normal');
      }
    })
    .runOnJS(true);

  // Compose gestures based on current view
  let composedGestures;
  if (view === VIEW.MODE_PICKER) {
    // In mode picker: allow mode selection taps and swipe down
    composedGestures = Gesture.Exclusive(swipeDown, tap3, tap2, tap1);
  } else if (view === VIEW.EMAIL_INPUT) {
    // In email input: allow swipe left to return, swipe down to login
    // Note: tap gestures are disabled in this view to prevent interference with input fields
    composedGestures = Gesture.Exclusive(swipeDown, swipeLeft);
  } else {
    // Fallback
    composedGestures = Gesture.Exclusive(swipeDown);
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <GestureDetector gesture={composedGestures}>
      <View style={styles.container}>
        <Text style={styles.title}>REGISTER</Text>

        {/* Mode Picker View */}
        {view === VIEW.MODE_PICKER && (
          <View style={styles.modePicker}>
            <Text style={styles.instruction}>
              Choose input method:
            </Text>
            <TouchableOpacity
              style={[styles.modeButton, styles.audioButton]}
              onPress={() => selectMode('audio')}
              accessible={true}
              accessibilityLabel="Audio mode"
              accessibilityHint="Tap once to select audio input mode"
            >
              <Text style={styles.modeButtonText}>1: AUDIO</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.modeButton, styles.brailleButton]}
              onPress={() => selectMode('braille')}
              accessible={true}
              accessibilityLabel="Braille mode"
              accessibilityHint="Tap twice to select braille input mode"
            >
              <Text style={styles.modeButtonText}>2: BRAILLE</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.modeButton, styles.keyboardButton]}
              onPress={() => selectMode('normal')}
              accessible={true}
              accessibilityLabel="Keyboard mode"
              accessibilityHint="Tap three times to select keyboard input mode"
            >
              <Text style={styles.modeButtonText}>3: KEYBOARD</Text>
            </TouchableOpacity>

            <Text style={styles.hint}>
              Swipe down to go to Login{'\n'}
              Selected mode: {inputMode || 'None'}
            </Text>
          </View>
        )}

        {/* Email Input View */}
        {view === VIEW.EMAIL_INPUT && (
          <View style={styles.inputArea}>
            <Text style={styles.label}>Enter your email:</Text>
            
            {/* Display current mode */}
            <Text style={styles.modeIndicator}>
              Mode: {inputMode?.toUpperCase() || 'Not selected'}
            </Text>

            {/* Input based on mode */}
            {inputMode === 'braille' ? (
              <BrailleInput
                onCharSubmit={(char) => setEmail(prev => prev + char)}
                onDeleteChar={() => setEmail(prev => prev.slice(0, -1))}
              />
            ) : inputMode === 'normal' ? (
              <TextInput
                style={styles.textInput}
                value={email}
                onChangeText={setEmail}
                placeholder="your@email.com"
                placeholderTextColor="#888"
                keyboardType="email-address"
                autoCapitalize="none"
                autoFocus={true}
                accessible={true}
                accessibilityLabel="Email input field"
                accessibilityHint="Type your email address"
              />
            ) : (
              // Audio mode - show transcription status
              <View style={styles.audioStatus}>
                <Text style={styles.audioStatusText}>
                  {email ? `Heard: ${email}` : "Listening for your email..."}
                </Text>
                <ActivityIndicator size="small" color="#6C63FF" style={styles.audioSpinner} />
              </View>
            )}

            {/* Email display */}
            {email.length > 0 && (
              <Text style={styles.emailPreview}>
                Email: {email}
              </Text>
            )}

            {/* Action buttons */}
            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.backButton]}
                onPress={returnToModePicker}
                accessible={true}
                accessibilityLabel="Back to mode selection"
                accessibilityHint="Swipe left or tap to return to mode selection"
              >
                <Text style={styles.actionButtonText}>← Back</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.actionButton, styles.submitButton, (!email || email.length < 3) && styles.disabledButton]}
                onPress={handleFinalize}
                disabled={!email || email.length < 3 || loading}
                accessible={true}
                accessibilityLabel="Secure account with fingerprint"
                accessibilityHint="Tap to scan fingerprint and complete registration"
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.actionButtonText}>Scan Fingerprint</Text>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.gestureHint}>
              Swipe left to return to mode selection{'\n'}
              Swipe down to go to Login
            </Text>
          </View>
        )}

        {/* Loading indicator */}
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#6C63FF" />
            <Text style={styles.loadingText}>Securing your account...</Text>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 30,
    letterSpacing: 1.5,
  },
  modePicker: {
    width: '100%',
    alignItems: 'center',
  },
  instruction: {
    color: '#8E8EA0',
    fontSize: 18,
    marginBottom: 30,
    textAlign: 'center',
  },
  modeButton: {
    width: '100%',
    height: 70,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 2,
  },
  audioButton: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderColor: '#4CAF50',
  },
  brailleButton: {
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderColor: '#6C63FF',
  },
  keyboardButton: {
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
    borderColor: '#FFC107',
  },
  modeButtonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 1.2,
  },
  hint: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 20,
  },
  inputArea: {
    width: '100%',
    alignItems: 'center',
  },
  label: {
    color: '#FFFFFF',
    fontSize: 20,
    marginBottom: 10,
    fontWeight: '600',
  },
  modeIndicator: {
    color: '#6C63FF',
    fontSize: 16,
    marginBottom: 20,
    fontWeight: 'bold',
  },
  textInput: {
    width: '100%',
    height: 55,
    backgroundColor: '#1A1A24',
    borderRadius: 12,
    paddingHorizontal: 18,
    color: '#FFFFFF',
    fontSize: 17,
    borderWidth: 1.5,
    borderColor: '#2A2A38',
    marginBottom: 20,
  },
  audioStatus: {
    width: '100%',
    height: 55,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    flexDirection: 'row',
    paddingHorizontal: 15,
  },
  audioStatusText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 10,
  },
  audioSpinner: {
    marginLeft: 10,
  },
  emailPreview: {
    color: '#8E8EA0',
    fontSize: 16,
    marginBottom: 25,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    height: 55,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 5,
  },
  backButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1.5,
    borderColor: '#666',
  },
  submitButton: {
    backgroundColor: '#6C63FF',
    borderWidth: 1.5,
    borderColor: '#6C63FF',
  },
  disabledButton: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  gestureHint: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 10,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 10, 15, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 16,
    marginTop: 15,
  },
});