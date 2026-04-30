import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { GestureDetector, Gesture, Directions } from 'react-native-gesture-handler';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../contexts/AuthContext';
import BrailleInput from '../components/BrailleInput';
import { startListeningFlow } from '../utils/audioHandler';

// Accessibility helper: speaks when an element receives focus
const speakOnFocus = (message) => {
  Speech.stop();
  setTimeout(() => Speech.speak(message), 100);
};

// View modes
const VIEW = {
  CHECKING: 'CHECKING',
  MODE_PICKER: 'MODE_PICKER',
  EMAIL_INPUT: 'EMAIL_INPUT',
  PASSWORD_INPUT: 'PASSWORD_INPUT',
};

export default function LoginScreen({ navigation }) {
  const { signIn, inputMode, setInputMode } = useAuth();
  const [view, setView] = useState(VIEW.CHECKING);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);

  // Initial check for saved account (email only — no stored password)
  useEffect(() => {
    checkAccount();
  }, []);

  const checkAccount = async () => {
    const { AsyncStorage } = await import('@react-native-async-storage/async-storage');
    const savedEmail = await AsyncStorage.getItem('saved_email');
    if (savedEmail) {
      setEmail(savedEmail);
      Speech.speak("Welcome back. Enter your password to login.");
      setView(VIEW.PASSWORD_INPUT);
    } else {
      setView(VIEW.MODE_PICKER);
      Speech.speak("No account found. Tap once for Audio, twice for Braille, three times for Keyboard. Swipe down for Registration.");
    }
  };

  // Handle mode selection
  const selectMode = (mode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setInputMode(mode);
    setView(VIEW.EMAIL_INPUT);

    if (mode === 'audio') {
      Speech.speak("Audio mode selected. Please speak your email address.");
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
    setEmail('');
    setPassword('');
    Speech.speak("Returning to mode selection.");
  };

  // Proceed to password input after email is entered
  const proceedToPassword = () => {
    if (!email || email.length < 3) {
      Speech.speak("Please enter a valid email address first.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setView(VIEW.PASSWORD_INPUT);

    if (inputMode === 'audio') {
      Speech.speak("Email received. Now please speak your password.");
      startListeningFlow("temp_user", (transcribedPassword) => {
        setPassword(transcribedPassword);
      });
    } else if (inputMode === 'braille') {
      Speech.speak("Email received. Now use the dot grid to enter your password.");
    } else {
      Speech.speak("Email received. Now tap the input field to type your password.");
      setTimeout(() => passwordInputRef.current?.focus(), 500);
    }
  };

  // Handle login with entered email + REAL password
  const handleLogin = async () => {
    if (!email || email.length < 3) {
      Speech.speak("Please enter a valid email address.");
      return;
    }
    if (!password || password.length < 3) {
      Speech.speak("Please enter your password, at least 3 characters.");
      return;
    }

    setLoading(true);
    try {
      await signIn(email, password);
      Speech.speak("Login successful.");
    } catch (error) {
      console.error("Sign in error:", error);
      // Stay on current screen so user can retry
    } finally {
      setLoading(false);
    }
  };

  // Go back to email input
  const goBackToEmail = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setView(VIEW.EMAIL_INPUT);
    setPassword('');
    Speech.speak("Going back to email input.");
  };

  // ============================================================
  // GESTURE DEFINITIONS
  // ============================================================

  // Swipe down to go to Register screen (always available)
  const swipeDown = Gesture.Fling()
    .direction(Directions.DOWN)
    .onEnd(() => {
      navigation.navigate('Register');
      Speech.speak("Switching to Registration.");
    })
    .runOnJS(true);

  // Swipe left to go back (available in input views)
  const swipeLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .onEnd(() => {
      if (view === VIEW.EMAIL_INPUT) {
        returnToModePicker();
      } else if (view === VIEW.PASSWORD_INPUT) {
        goBackToEmail();
      }
    })
    .runOnJS(true);

  // Tap gestures for mode selection (only in MODE_PICKER view)
  const tap1 = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd(() => {
      if (view === VIEW.MODE_PICKER) selectMode('audio');
    })
    .runOnJS(true);

  const tap2 = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (view === VIEW.MODE_PICKER) selectMode('braille');
    })
    .runOnJS(true);

  const tap3 = Gesture.Tap()
    .numberOfTaps(3)
    .onEnd(() => {
      if (view === VIEW.MODE_PICKER) selectMode('normal');
    })
    .runOnJS(true);

  // Compose gestures based on current view
  let composedGestures;
  if (view === VIEW.CHECKING) {
    composedGestures = Gesture.Exclusive(swipeDown);
  } else if (view === VIEW.MODE_PICKER) {
    composedGestures = Gesture.Exclusive(swipeDown, tap3, tap2, tap1);
  } else if (view === VIEW.EMAIL_INPUT || view === VIEW.PASSWORD_INPUT) {
    composedGestures = Gesture.Exclusive(swipeDown, swipeLeft);
  } else {
    composedGestures = Gesture.Exclusive(swipeDown);
  }

  // ============================================================
  // RENDER HELPERS
  // ============================================================

  // Render appropriate input field based on current mode and field type
  const renderInputField = (fieldValue, fieldType, inputRef) => {
    if (inputMode === 'braille') {
      const setters = {
        email: (val) => setEmail(prev => prev + val),
        password: (val) => setPassword(prev => prev + val),
      };
      const deleters = {
        email: () => setEmail(prev => prev.slice(0, -1)),
        password: () => setPassword(prev => prev.slice(0, -1)),
      };
      return (
        <BrailleInput
          onCharSubmit={setters[fieldType]}
          onDeleteChar={deleters[fieldType]}
        />
      );
    }

    if (inputMode === 'normal') {
      const labels = {
        email: 'Email input field',
        password: 'Password input field',
      };
      const hints = {
        email: 'Type your email address',
        password: 'Type your password',
      };
      const placeholders = {
        email: 'your@email.com',
        password: 'Your password',
      };
      const keyboardTypes = {
        email: 'email-address',
        password: 'default',
      };

      return (
        <TextInput
          ref={inputRef}
          style={styles.textInput}
          value={fieldValue}
          onChangeText={fieldType === 'email' ? setEmail : setPassword}
          placeholder={placeholders[fieldType]}
          placeholderTextColor="#888"
          keyboardType={keyboardTypes[fieldType]}
          autoCapitalize={fieldType === 'email' ? 'none' : 'none'}
          autoFocus={true}
          secureTextEntry={fieldType === 'password'}
          accessible={true}
          accessibilityLabel={labels[fieldType]}
          accessibilityHint={hints[fieldType]}
          onFocus={() => speakOnFocus(`${labels[fieldType]}. ${hints[fieldType]}`)}
        />
      );
    }

    // Audio mode - show transcription status
    const values = { email, password };
    return (
      <View style={styles.audioStatus}>
        <Text style={styles.audioStatusText}>
          {values[fieldType] ? `Heard: ${values[fieldType]}` : `Listening for your ${fieldType}...`}
        </Text>
        <ActivityIndicator size="small" color="#6C63FF" style={styles.audioSpinner} />
      </View>
    );
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <GestureDetector gesture={composedGestures}>
      <View style={styles.container}>
        <Text
          style={styles.title}
          accessible={true}
          accessibilityLabel="Login screen"
          accessibilityRole="header"
        >
          EyeDentify
        </Text>

        {/* Checking view */}
        {view === VIEW.CHECKING && (
          <View style={styles.checkingView}>
            <ActivityIndicator size="large" color="#6C63FF" />
            <Text style={styles.checkingText}>
              Checking for saved account...
            </Text>
          </View>
        )}

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
              focusable={true}
              accessibilityLabel="Audio input mode"
              accessibilityHint="Tap once to select audio input mode"
              onFocus={() => speakOnFocus('Audio mode button. Tap once to select audio input.')}
            >
              <Text style={styles.modeButtonText}>1: AUDIO</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeButton, styles.brailleButton]}
              onPress={() => selectMode('braille')}
              accessible={true}
              focusable={true}
              accessibilityLabel="Braille input mode"
              accessibilityHint="Tap twice to select braille input mode"
              onFocus={() => speakOnFocus('Braille mode button. Tap twice to select braille input.')}
            >
              <Text style={styles.modeButtonText}>2: BRAILLE</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeButton, styles.keyboardButton]}
              onPress={() => selectMode('normal')}
              accessible={true}
              focusable={true}
              accessibilityLabel="Keyboard input mode"
              accessibilityHint="Tap three times to select keyboard typing"
              onFocus={() => speakOnFocus('Keyboard mode button. Tap three times to select keyboard input.')}
            >
              <Text style={styles.modeButtonText}>3: KEYBOARD</Text>
            </TouchableOpacity>

            <Text style={styles.hint}>
              Swipe down to go to Registration{'\n'}
              Selected mode: {inputMode || 'None'}
            </Text>
          </View>
        )}

        {/* Email Input View */}
        {view === VIEW.EMAIL_INPUT && (
          <View style={styles.inputArea}>
            <Text style={styles.label}>Step 1 - Email:</Text>
            <Text style={styles.modeIndicator}>
              Mode: {inputMode?.toUpperCase() || 'Not selected'}
            </Text>

            {renderInputField(email, 'email', emailInputRef)}

            {/* Speak email button — audio/braille ONLY */}
            {inputMode !== 'normal' && (
              <TouchableOpacity
                style={styles.speakButton}
                onPress={() => {
                  Speech.speak(email || 'No email entered yet.');
                }}
                accessible={true}
                focusable={true}
                accessibilityRole="button"
                accessibilityLabel="Hear Email button"
                accessibilityHint="Tap to hear your email address read aloud"
                onFocus={() => speakOnFocus('Hear Email button. Tap to hear your email address read aloud.')}
              >
                <Text style={styles.speakButtonText}>Hear Email</Text>
              </TouchableOpacity>
            )}

            {email.length > 0 && (
              <Text style={styles.previewText}>Email: {email}</Text>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.backButton]}
                onPress={returnToModePicker}
                accessible={true}
                focusable={true}
                accessibilityRole="button"
                accessibilityLabel="Back button"
                accessibilityHint="Returns to mode selection"
                onFocus={() => speakOnFocus('Back button. Returns to mode selection.')}
              >
                <Text style={styles.actionButtonText}>← Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.submitButton, (!email || email.length < 3) && styles.disabledButton]}
                onPress={proceedToPassword}
                disabled={!email || email.length < 3}
                accessible={true}
                focusable={true}
                accessibilityRole="button"
                accessibilityLabel="Next button"
                accessibilityHint="Proceeds to password input"
                onFocus={() => speakOnFocus('Next button. Proceeds to password input.')}
              >
                <Text style={styles.actionButtonText}>Next →</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.gestureHint}>
              Swipe left to go back{'\n'}
              Swipe down to go to Register
            </Text>
          </View>
        )}

        {/* Password Input View */}
        {view === VIEW.PASSWORD_INPUT && (
          <View style={styles.inputArea}>
            <Text style={styles.label}>Step 2 - Password:</Text>
            <Text style={styles.modeIndicator}>
              Mode: {inputMode?.toUpperCase() || 'Not selected'}
            </Text>
            <Text style={styles.emailPreview}>Email: {email}</Text>

            {renderInputField(password, 'password', passwordInputRef)}

            {/* Speak password hint — audio/braille ONLY */}
            {inputMode !== 'normal' && (
              <TouchableOpacity
                style={styles.speakButton}
                onPress={() => {
                  const masked = '*'.repeat(password.length);
                  Speech.speak(password ? `Password entered: ${masked} characters` : 'No password entered yet.');
                }}
                accessible={true}
                focusable={true}
                accessibilityRole="button"
                accessibilityLabel="Password info button"
                accessibilityHint="Tap to hear how many characters you've entered"
                onFocus={() => speakOnFocus('Password info button. Tap to hear how many characters you have entered.')}
              >
                <Text style={styles.speakButtonText}>{password ? `Password: ${'*'.repeat(password.length)}` : 'No password'}</Text>
              </TouchableOpacity>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.backButton]}
                onPress={goBackToEmail}
                accessible={true}
                focusable={true}
                accessibilityRole="button"
                accessibilityLabel="Back button"
                accessibilityHint="Returns to email input"
                onFocus={() => speakOnFocus('Back button. Returns to email input.')}
              >
                <Text style={styles.actionButtonText}>← Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.submitButton, (!password || password.length < 3 || loading) && styles.disabledButton]}
                onPress={handleLogin}
                disabled={!password || password.length < 3 || loading}
                accessible={true}
                focusable={true}
                accessibilityRole="button"
                accessibilityLabel="Login button"
                accessibilityHint="Tap to login with your email and password"
                onFocus={() => speakOnFocus('Login button. Tap to login with your email and password.')}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.actionButtonText}>Login</Text>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.gestureHint}>
              Swipe left to go back{'\n'}
              Swipe down to go to Register
            </Text>
          </View>
        )}

        {/* Loading indicator */}
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#6C63FF" />
            <Text style={styles.loadingText}>Logging in...</Text>
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
    fontSize: 42,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 30,
    letterSpacing: 2,
  },
  checkingView: {
    alignItems: 'center',
  },
  checkingText: {
    color: '#8E8EA0',
    fontSize: 16,
    marginTop: 20,
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
    marginBottom: 20,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  previewText: {
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
  speakButton: {
    width: '100%',
    height: 44,
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#6C63FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  speakButtonText: {
    color: '#6C63FF',
    fontSize: 15,
    fontWeight: '600',
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
