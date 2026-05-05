import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { GestureDetector, Gesture, Directions } from 'react-native-gesture-handler';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../contexts/AuthContext';
import BrailleInput from '../components/BrailleInput';
import { useAudioListener } from '../utils/audioHandler';

// Accessibility helper: speaks when an element receives focus
const speakOnFocus = (message) => {
  Speech.stop();
  setTimeout(() => Speech.speak(message), 100);
};

// View modes
const VIEW = {
  MODE_PICKER: 'MODE_PICKER',
  EMAIL_INPUT: 'EMAIL_INPUT',
  PASSWORD_INPUT: 'PASSWORD_INPUT',
};

export default function LoginScreen({ navigation }) {
  const { signIn, inputMode, setInputMode } = useAuth();
  const [view, setView] = useState(VIEW.MODE_PICKER);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStopping, setIsStopping] = useState(false); // guard: true while async stop() is in flight
  const [recordingField, setRecordingField] = useState('');
  const [isAudioEditing, setIsAudioEditing] = useState(false);
  const [isReallyListening, setIsReallyListening] = useState(false); // true ONLY after recorder.record() succeeds (2nd haptic)
  const [emailStep, setEmailStep] = useState(''); // '' | 'local' | 'domain' — two-step email recording
  const [emailLocalPart, setEmailLocalPart] = useState(''); // stores first part of email before @
  const emailInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const audioControlRef = useRef(null);
  const { startListening, cleanupRecorder } = useAudioListener();

  // Cleanup audio recorder on unmount to prevent IllegalStateException on re-entry
  useEffect(() => {
    return () => {
      Speech.stop(); // stop any TTS when leaving screen
      cleanupRecorder();
      setIsReallyListening(false);
    };
  }, [cleanupRecorder]);

  // Welcome message on mount — no storage check needed
  useEffect(() => {
    Speech.speak("Login. Tap once for Audio, twice for Braille, three times for Keyboard. Swipe down for Registration.");
  }, []);

  // Create a wrapped callback that handles both transcription result AND processing state
  const makeAudioCallback = (setter, fieldType) => {
    const cb = (transcribedText) => {
      setter(transcribedText);
      setIsRecording(false);
      setIsProcessing(false);
      setRecordingField('');
      setIsReallyListening(false);
    };
    cb.__processing = (processing) => {
      if (processing) {
        setIsRecording(false);
        setIsProcessing(true);
        setIsReallyListening(false);
      } else {
        setIsProcessing(false);
      }
    };
    cb.__fieldType = fieldType;
    return cb;
  };

  // Handle mode selection
  const selectMode = (mode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Speech.stop(); // Immediately stop any previous TTS so mic can start faster
    setInputMode(mode);
    setView(VIEW.EMAIL_INPUT);

    if (mode === 'audio') {
      Speech.speak("Audio mode selected. We will record your email in two parts. Tap start to speak your email name, the part before the at sign.");
      setRecordingField('email');
      setEmailStep('');
      setEmailLocalPart('');
    } else if (mode === 'braille') {
      Speech.speak("Braille mode selected. Use the dot grid to enter your email.");
    } else {
      Speech.speak("Keyboard mode selected. Tap the input to type your email.");
    }
  };

  // Return to mode selection
  const returnToModePicker = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Speech.stop();
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
    Speech.stop(); // Stop previous TTS so mic starts fast when user taps START
    setView(VIEW.PASSWORD_INPUT);

    if (inputMode === 'audio') {
      Speech.speak("Email received. Tap start to speak your password.");
      setRecordingField('password');
    } else if (inputMode === 'braille') {
      Speech.speak("Email received. Now use the dot grid to enter your password.");
    } else {
      Speech.speak("Email received. Now tap the input to type your password.");
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
  // TWO-STEP EMAIL AUDIO RECORDING
  // ============================================================

  // Start recording email LOCAL part (before @). After it completes, auto-chains to domain.
  const startEmailLocalRecording = async () => {
    setEmailStep('local');
    setEmailLocalPart('');
    setIsRecording(true);
    setIsReallyListening(false);
    setRecordingField('email');

    const onLocalReceived = (transcribedText) => {
      setEmailLocalPart(transcribedText);
      setIsRecording(false);
      setIsProcessing(false);
      setIsReallyListening(false);
      Speech.stop();
      setTimeout(() => {
        Speech.speak(`I heard: ${transcribedText}. Now tap start to speak your email domain, like gmail dot com.`);
        setEmailStep('domain');
      }, 500);
    };
    onLocalReceived.__processing = (processing) => {
      if (processing) { setIsRecording(false); setIsProcessing(true); setIsReallyListening(false); }
      else { setIsProcessing(false); }
    };
    onLocalReceived.__fieldType = 'email_local';

    try {
      const ctrl = await startListening("temp_user", onLocalReceived, () => setIsReallyListening(true));
      audioControlRef.current = ctrl;
    } catch (e) {
      console.warn('[Audio] Email local start error:', e?.message);
      setIsRecording(false);
      setEmailStep('');
    }
  };

  // Start recording email DOMAIN part (after @). Combines with local part.
  const startEmailDomainRecording = async () => {
    setEmailStep('domain');
    setIsRecording(true);
    setIsReallyListening(false);
    setRecordingField('email');

    const onDomainReceived = (transcribedText) => {
      const fullEmail = `${emailLocalPart}@${transcribedText}`;
      setEmail(fullEmail);
      setIsRecording(false);
      setIsProcessing(false);
      setRecordingField('');
      setIsReallyListening(false);
      setEmailStep('');
      setEmailLocalPart('');
    };
    onDomainReceived.__processing = (processing) => {
      if (processing) { setIsRecording(false); setIsProcessing(true); setIsReallyListening(false); }
      else { setIsProcessing(false); }
    };
    onDomainReceived.__fieldType = 'email_domain';

    try {
      const ctrl = await startListening("temp_user", onDomainReceived, () => setIsReallyListening(true));
      audioControlRef.current = ctrl;
    } catch (e) {
      console.warn('[Audio] Email domain start error:', e?.message);
      setIsRecording(false);
    }
  };

  const getEmailStepLabel = () => {
    if (emailStep === 'local') return 'email name (before @)';
    if (emailStep === 'domain') return 'email domain (after @)';
    return 'email address';
  };

  // ============================================================
  // GESTURE DEFINITIONS
  // ============================================================

  // Swipe down to go to Register screen (always available)
  const swipeDown = Gesture.Fling()
    .direction(Directions.DOWN)
    .onEnd(async () => {
      // Stop any ongoing speech/recording before leaving this screen
      Speech.stop();
      if (audioControlRef.current && isRecording && isReallyListening) {
        try { await audioControlRef.current.stop(); } catch (_) {}
      }
      setIsRecording(false);
      setIsReallyListening(false);
      setIsProcessing(false);
      setRecordingField('');
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
  if (view === VIEW.MODE_PICKER) {
    composedGestures = Gesture.Exclusive(swipeDown, tap3, tap2, tap1);
  } else if (view === VIEW.EMAIL_INPUT || view === VIEW.PASSWORD_INPUT) {
    composedGestures = Gesture.Exclusive(swipeDown, swipeLeft);
  } else {
    composedGestures = Gesture.Exclusive(swipeDown);
  }

  // ============================================================
  // RENDER HELPERS
  // ============================================================

  // Render appropriate input based on current mode and field type
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
        email: 'Email input',
        password: 'Password input',
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

    // Audio mode - show transcription status with Stop/Re-record control
    const values = { email, password };
    const hasValue = !!values[fieldType];

    // When not recording/processing and already has a value, show editable input + re-record button
    if (!isRecording && !isProcessing && hasValue) {
      const labels = {
        email: 'Email input',
        password: 'Password input',
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
        <View style={styles.audioEditContainer}>
          <TextInput
            ref={inputRef}
            style={styles.audioEditableInput}
            value={fieldValue}
            onChangeText={fieldType === 'email' ? setEmail : setPassword}
            placeholder={placeholders[fieldType]}
            placeholderTextColor="#666"
            keyboardType={keyboardTypes[fieldType]}
            autoCapitalize="none"
            secureTextEntry={false}
            autoFocus={isAudioEditing}
            accessible={true}
            accessibilityLabel={labels[fieldType]}
            accessibilityHint={`Heard: ${fieldValue}. Tap to edit.`}
            onFocus={() => { setIsAudioEditing(true); speakOnFocus(`${labels[fieldType]}. Current value: ${fieldValue}. Edit as needed.`); }}
          />
          <TouchableOpacity
            style={[styles.audioStopButton, styles.audioReRecordButton]}
            onPress={async () => {
              if (isStopping || isProcessing) return;
              if (fieldType === 'email') {
                setEmail('');
                setEmailStep('');
                setEmailLocalPart('');
                await startEmailLocalRecording();
              } else {
                setIsRecording(true);
                setIsReallyListening(false);
                setRecordingField(fieldType);
                const ctrl = await startListening("temp_user", makeAudioCallback(setPassword, fieldType), () => setIsReallyListening(true));
                audioControlRef.current = ctrl;
              }
            }}
            disabled={loading || isStopping}
          >
            <Text style={styles.audioStopButtonText}>🔄 RE-RECORD</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.audioStatus}>
        <View style={styles.audioStatusInner}>
          <Text style={[styles.audioStatusText, !isRecording && !isProcessing && hasValue && styles.audioStatusDone]}>
            {isProcessing ? '⏳ Processing your audio...' :
              (hasValue ? `Heard: ${values[fieldType]}` : (!isReallyListening && isRecording ? `Loading microphone...` : (isRecording ? `🎙 Listening for your ${fieldType === 'email' ? getEmailStepLabel() : fieldType}...` : `Tap below to speak your ${fieldType === 'email' ? getEmailStepLabel() : fieldType}`)))}
          </Text>
          {(isRecording || isProcessing) && <ActivityIndicator size="small" color={isProcessing ? "#FF9800" : (isReallyListening ? "#FF4444" : "#888")} style={styles.audioSpinner} />}
        </View>
        <TouchableOpacity
          style={[
            styles.audioStopButton,
            isRecording && recordingField === fieldType ? styles.audioStopButtonActive :
              (isProcessing ? styles.audioProcessingButton : styles.audioReRecordButton),
          ]}
          onPress={async () => {
            if (isStopping || isProcessing) return;

            if (isRecording && recordingField === fieldType && audioControlRef.current && isReallyListening) {
              // --- STOP recording (only works after 2nd haptic / real recording started) ---
              setIsStopping(true);
              setIsReallyListening(false);
              try {
                await audioControlRef.current.stop();
              } catch (err) {
                console.warn('[Audio] Stop error:', err?.message);
              }
              setIsStopping(false);
            } else if (!isReallyListening && isRecording) {
              // Still initializing — ignore tap or speak hint
              Speech.speak('Still starting. Please wait.');
              return;
            } else {
              // --- START / RE-RECORD: begin listening ---
              if (fieldType === 'email') {
                if (emailStep === 'domain' && emailLocalPart) {
                  await startEmailDomainRecording();
                } else {
                  await startEmailLocalRecording();
                }
              } else {
                setIsRecording(true);
                setIsReallyListening(false);
                setIsProcessing(false);
                setRecordingField(fieldType);
                const ctrl = await startListening("temp_user", makeAudioCallback(setPassword, fieldType), () => setIsReallyListening(true));
                audioControlRef.current = ctrl;
              }
            }
          }}
          disabled={loading || isProcessing || isStopping}
        >
          <Text style={styles.audioStopButtonText}>
            {isProcessing ? '⏳ PROCESSING...' :
              (!isReallyListening && isRecording ? '⏳ STARTING...' :
                (isRecording && recordingField === fieldType ? '⏹ STOP' : (hasValue ? '🔄 RE-RECORD' : '🎤 START')))}
          </Text>
        </TouchableOpacity>
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
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  audioStatusInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  audioStatusText: {
    color: '#4CAF50',
    fontSize: 16,
    fontWeight: '600',
    marginRight: 10,
  },
  audioStatusDone: {
    color: '#4ADE80',
  },
  audioSpinner: {
    marginLeft: 10,
  },
  audioStopButton: {
    width: '100%',
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioStopButtonActive: {
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
    borderColor: '#FF4444',
    borderWidth: 1.5,
  },
  audioProcessingButton: {
    backgroundColor: 'rgba(255, 152, 0, 0.15)',
    borderColor: '#FF9800',
    borderWidth: 1.5,
  },
  audioReRecordButton: {
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderColor: '#6C63FF',
    borderWidth: 1.5,
  },
  audioStopButtonText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
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
  // Audio mode - editable input after transcription
  audioEditContainer: {
    width: '100%',
  },
  audioEditableInput: {
    width: '100%',
    height: 55,
    backgroundColor: '#1A2A1A',
    borderRadius: 12,
    paddingHorizontal: 18,
    color: '#4ADE80',
    fontSize: 17,
    borderWidth: 1.5,
    borderColor: '#4CAF50',
    marginBottom: 10,
  },
});
