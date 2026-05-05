import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { GestureDetector, Gesture, Directions } from 'react-native-gesture-handler';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../contexts/AuthContext';
import BrailleInput from '../components/BrailleInput';
import { useAudioListener } from '../utils/audioHandler';

// View modes
const VIEW = {
  MODE_PICKER: 'MODE_PICKER',
  NAME_INPUT: 'NAME_INPUT',
  EMAIL_INPUT: 'EMAIL_INPUT',
  PASSWORD_INPUT: 'PASSWORD_INPUT',
};

// Accessibility helper: speaks when an element receives focus
const speakOnFocus = (message) => {
  Speech.stop();
  // Small delay to avoid cutting off previous speech
  setTimeout(() => Speech.speak(message), 100);
};

export default function RegisterScreen({ navigation }) {
  const { signUpPasswordless, setInputMode, inputMode } = useAuth();
  const [view, setView] = useState(VIEW.MODE_PICKER);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); // shows "Processing..." after stop is clicked
  const [recordingField, setRecordingField] = useState(''); // '' | 'name' | 'email' | 'password' — which field is actively recording
  const [showPassword, setShowPassword] = useState(false); // eye icon toggle for keyboard mode

  const emailInputRef = useRef(null);
  const nameInputRef = useRef(null);
  const passwordInputRef = useRef(null);
  const audioControlRef = useRef(null); // holds { stop } from useAudioListener
  const { startListening } = useAudioListener();

  // Welcome message on mount
  useEffect(() => {
    Speech.speak("Registration. Choose input method. Tap 1 for Audio, 2 for Braille, 3 for Keyboard. Swipe down for Login.");
  }, []);

  // Create a wrapped callback that handles both transcription result AND processing state
  const makeAudioCallback = (setter, fieldType) => {
    const cb = (transcribedText) => {
      setter(transcribedText);
      setIsRecording(false);
      setIsProcessing(false);
      setRecordingField('');
    };
    cb.__processing = (processing) => {
      if (processing) {
        // User clicked stop — immediately show feedback
        setIsRecording(false);
        setIsProcessing(true);
      } else {
        setIsProcessing(false);
      }
    };
    // Store field type so we know how to speak the result
    cb.__fieldType = fieldType;
    return cb;
  };

  // Handle mode selection
  const selectMode = (mode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setInputMode(mode);
    setView(VIEW.NAME_INPUT);

    if (mode === 'audio') {
      Speech.speak("Audio mode selected. Please speak your full name.");
      setIsRecording(true);
      setIsProcessing(false);
      setRecordingField('name');
      startListening("temp_user", makeAudioCallback(setName, 'name')).then((ctrl) => { audioControlRef.current = ctrl; });
    } else if (mode === 'braille') {
      Speech.speak("Braille mode selected. Use the dot grid to enter your full name.");
    } else {
      Speech.speak("Keyboard mode selected. Tap the input to type your full name.");
    }
  };

  // Move to email input step after name is done
  const proceedToEmail = () => {
    if (!name || name.length < 2) {
      Speech.speak("Please enter a valid name first.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setView(VIEW.EMAIL_INPUT);

    if (inputMode === 'audio') {
      Speech.speak("Name received. Now please speak your email address.");
      setIsRecording(true);
      setIsProcessing(false);
      setRecordingField('email');
      startListening("temp_user", makeAudioCallback(setEmail, 'email')).then((ctrl) => { audioControlRef.current = ctrl; });
    } else if (inputMode === 'braille') {
      Speech.speak("Name received. Now use the dot grid to enter your email address.");
    } else {
      Speech.speak("Name received. Now tap the input to type your email address.");
      setTimeout(() => emailInputRef.current?.focus(), 500);
    }
  };

  // Move to password input step after email is done
  const proceedToPassword = () => {
    if (!email || email.length < 3) {
      Speech.speak("Please enter a valid email address first.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setView(VIEW.PASSWORD_INPUT);

    if (inputMode === 'audio') {
      Speech.speak("Email received. Now please speak your desired password.");
      setIsRecording(true);
      setIsProcessing(false);
      setRecordingField('password');
      startListening("temp_user", makeAudioCallback(setPassword, 'password')).then((ctrl) => { audioControlRef.current = ctrl; });
    } else if (inputMode === 'braille') {
      Speech.speak("Email received. Now use the dot grid to enter your password.");
    } else {
      Speech.speak("Email received. Now tap the input to type your password.");
      setTimeout(() => passwordInputRef.current?.focus(), 500);
    }
  };

  // Return to mode selection
  const returnToModePicker = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setView(VIEW.MODE_PICKER);
    Speech.speak("Returning to mode selection.");
  };

  // Go back to previous step
  const goBackToEmail = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setView(VIEW.EMAIL_INPUT);
    Speech.speak("Going back to email input.");
  };

  // Complete registration — no biometric required
  const handleFinalize = async () => {
    if (!password || password.length < 3) {
      Speech.speak("Please enter a valid password, at least 3 characters.");
      return;
    }

    setLoading(true);
    try {
      await signUpPasswordless(email, password, inputMode, name);
      Speech.speak(`Account created. Welcome to EyeDentify, ${name}.`);
    } catch (error) {
      console.error('Registration error:', error);
      Speech.speak("Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // GESTURE DEFINITIONS
  // ============================================================

  // Swipe down to go to Login screen (always available)
  const swipeDown = Gesture.Fling()
    .direction(Directions.DOWN)
    .onEnd(() => {
      navigation.navigate('Login');
      Speech.speak("Switching to Login.");
    })
    .runOnJS(true);

  // Swipe left to go back (available in input views)
  const swipeLeft = Gesture.Fling()
    .direction(Directions.LEFT)
    .onEnd(() => {
      if (view === VIEW.NAME_INPUT) {
        returnToModePicker();
      } else if (view === VIEW.EMAIL_INPUT) {
        setView(VIEW.NAME_INPUT);
        Speech.speak("Going back to name input.");
      } else if (view === VIEW.PASSWORD_INPUT) {
        setView(VIEW.EMAIL_INPUT);
        Speech.speak("Going back to email input.");
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
  } else if ([VIEW.NAME_INPUT, VIEW.EMAIL_INPUT, VIEW.PASSWORD_INPUT].includes(view)) {
    composedGestures = Gesture.Exclusive(swipeDown, swipeLeft);
  } else {
    composedGestures = Gesture.Exclusive(swipeDown);
  }

  // ============================================================
  // RENDER HELPERS
  // ============================================================

  // Renders the appropriate input component based on current mode
  const renderInputField = (fieldValue, fieldType, inputRef) => {
    if (inputMode === 'braille') {
      const setters = {
        email: (val) => setEmail(prev => prev + val),
        name: (val) => setName(prev => prev + val),
        password: (val) => setPassword(prev => prev + val),
      };
      const deleters = {
        email: () => setEmail(prev => prev.slice(0, -1)),
        name: () => setName(prev => prev.slice(0, -1)),
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
        name: 'Name input',
        password: 'Password input',
      };
      const hints = {
        email: 'Type your email address',
        name: 'Type your full name',
        password: 'Type your password',
      };
      const placeholders = {
        email: 'your@email.com',
        name: 'Your full name',
        password: 'Your password',
      };
      const keyboardTypes = {
        email: 'email-address',
        name: 'default',
        password: 'default',
      };
      const isSecure = fieldType === 'password' && !showPassword;

      // For password field in keyboard mode, render input + eye icon together
      if (fieldType === 'password') {
        return (
          <View style={styles.passwordInputWrapper}>
            <TextInput
              ref={inputRef}
              style={[styles.textInput, styles.textInputWithIcon]}
              value={fieldValue}
              onChangeText={setPassword}
              placeholder={placeholders[fieldType]}
              placeholderTextColor="#888"
              keyboardType={keyboardTypes[fieldType]}
              autoFocus={true}
              secureTextEntry={isSecure}
              accessible={true}
              accessibilityLabel={labels[fieldType]}
              accessibilityHint={hints[fieldType]}
              onFocus={() => speakOnFocus(`${labels[fieldType]}. ${hints[fieldType]}`)}
            />
            <TouchableOpacity
              style={styles.eyeIconBtn}
              onPress={() => {
                setShowPassword(prev => !prev);
                Speech.speak(showPassword ? 'Password hidden.' : 'Password revealed.');
              }}
              accessible={true}
              accessibilityLabel={showPassword ? "Hide password" : "Show password"}
              accessibilityHint="Double tap to toggle password visibility"
            >
              <Text style={styles.eyeIconText}>{showPassword ? '🙈' : '👁'}</Text>
            </TouchableOpacity>
          </View>
        );
      }

      return (
        <TextInput
          ref={inputRef}
          style={styles.textInput}
          value={fieldValue}
          onChangeText={fieldType === 'email' ? setEmail : fieldType === 'name' ? setName : setPassword}
          placeholder={placeholders[fieldType]}
          placeholderTextColor="#888"
          keyboardType={keyboardTypes[fieldType]}
          autoCapitalize={fieldType === 'email' ? 'none' : 'words'}
          autoFocus={true}
          secureTextEntry={isSecure}
          accessible={true}
          accessibilityLabel={labels[fieldType]}
          accessibilityHint={hints[fieldType]}
          onFocus={() => speakOnFocus(`${labels[fieldType]}. ${hints[fieldType]}`)}
        />
      );
    }

    // Audio mode - show transcription status with Stop/Re-record control
    const values = { email, name, password };
    const hasValue = !!values[fieldType];

    return (
      <View style={styles.audioStatus}>
        <View style={styles.audioStatusInner}>
          <Text style={[styles.audioStatusText, !isRecording && !isProcessing && hasValue && styles.audioStatusDone]}>
            {isProcessing ? '⏳ Processing your audio...' :
              (hasValue ? `Heard: ${values[fieldType]}` : (isRecording ? `Listening for your ${fieldType}...` : `Tap below to speak your ${fieldType}`))}
          </Text>
          {(isRecording || isProcessing) && <ActivityIndicator size="small" color={isProcessing ? "#FF9800" : "#FF4444"} style={styles.audioSpinner} />}
        </View>
        <TouchableOpacity
          style={[
            styles.audioStopButton,
            isRecording && recordingField === fieldType ? styles.audioStopButtonActive :
              (isProcessing ? styles.audioProcessingButton : styles.audioReRecordButton),
          ]}
          onPress={() => {
            if ((isRecording && recordingField === fieldType || isProcessing) && audioControlRef.current) {
              // During recording for THIS field: stop; during processing: already stopping, ignore
              if (!isProcessing) {
                audioControlRef.current.stop();
              }
            } else {
              // Re-record: trigger listening flow again based on field type
              setIsRecording(true);
              setIsProcessing(false);
              setRecordingField(fieldType);
              const setter = fieldType === 'name' ? setName : fieldType === 'email' ? setEmail : setPassword;
              startListening("temp_user", makeAudioCallback(setter, fieldType)).then((ctrl) => { audioControlRef.current = ctrl; });
            }
          }}
          disabled={loading || isProcessing}
        >
          <Text style={styles.audioStopButtonText}>
            {isProcessing ? '⏳ PROCESSING...' :
              (isRecording && recordingField === fieldType ? '⏹ STOP' : (hasValue ? '🔄 RE-RECORD' : '🎤 START'))}
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
          accessibilityLabel="Register screen"
          accessibilityRole="header"
        >
          REGISTER
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
              accessibilityLabel="Audio input mode"
              accessibilityHint="Tap once or press Enter to select voice input"
              onFocus={() => speakOnFocus('Audio mode button. Tap once to select audio input mode.')}
            >
              <Text style={styles.modeButtonText}>1: AUDIO</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeButton, styles.brailleButton]}
              onPress={() => selectMode('braille')}
              accessible={true}
              accessibilityLabel="Braille input mode"
              accessibilityHint="Tap twice or press Enter to select braille dot grid input"
              onFocus={() => speakOnFocus('Braille mode button. Tap twice to select braille input mode.')}
            >
              <Text style={styles.modeButtonText}>2: BRAILLE</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeButton, styles.keyboardButton]}
              onPress={() => selectMode('normal')}
              accessible={true}
              accessibilityLabel="Keyboard input mode"
              accessibilityHint="Tap three times or press Enter to select keyboard typing"
              onFocus={() => speakOnFocus('Keyboard mode button. Tap three times to select keyboard input mode.')}
            >
              <Text style={styles.modeButtonText}>3: KEYBOARD</Text>
            </TouchableOpacity>

            <Text style={styles.hint}>
              Swipe down to go to Login{'\n'}
              Selected mode: {inputMode || 'None'}
            </Text>
          </View>
        )}

        {/* Name Input View — STEP 1 */}
        {view === VIEW.NAME_INPUT && (
          <View style={styles.inputArea}>
            <Text style={styles.label}>Step 1 of 3 - Full Name:</Text>
            <Text style={styles.modeIndicator}>
              Mode: {inputMode?.toUpperCase() || 'Not selected'}
            </Text>

            {renderInputField(name, 'name', nameInputRef)}

            {name.length > 0 && (
              <Text style={styles.emailPreview}>Name: {name}</Text>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.backButton]}
                onPress={returnToModePicker}
                accessible={true}
                accessibilityLabel="Back button"
                accessibilityHint="Returns to input method selection"
                onFocus={() => speakOnFocus('Back button. Returns to mode selection.')}
              >
                <Text style={styles.actionButtonText}>← Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.submitButton, (!name || name.length < 2) && styles.disabledButton]}
                onPress={proceedToEmail}
                disabled={!name || name.length < 2}
                accessible={true}
                accessibilityLabel="Next button"
                accessibilityHint="Proceeds to email input"
                onFocus={() => speakOnFocus('Next button. Proceeds to email input.')}
              >
                <Text style={styles.actionButtonText}>Next →</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.gestureHint}>
              Swipe left to go back{'\n'}
              Swipe down to go to Login
            </Text>
          </View>
        )}

        {/* Email Input View — STEP 2 */}
        {view === VIEW.EMAIL_INPUT && (
          <View style={styles.inputArea}>
            <Text style={styles.label}>Step 2 of 3 - Email:</Text>
            <Text style={styles.modeIndicator}>
              Mode: {inputMode?.toUpperCase() || 'Not selected'}
            </Text>

            {renderInputField(email, 'email', emailInputRef)}

            {email.length > 0 && (
              <Text style={styles.emailPreview}>Email: {email}</Text>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.backButton]}
                onPress={() => { setView(VIEW.NAME_INPUT); Speech.speak("Going back to name input."); }}
                accessible={true}
                accessibilityLabel="Back button"
                accessibilityHint="Returns to name input"
                onFocus={() => speakOnFocus('Back button. Returns to name input.')}
              >
                <Text style={styles.actionButtonText}>← Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.submitButton, (!email || email.length < 3) && styles.disabledButton]}
                onPress={proceedToPassword}
                disabled={!email || email.length < 3}
                accessible={true}
                accessibilityLabel="Next button"
                accessibilityHint="Proceeds to password input"
                onFocus={() => speakOnFocus('Next button. Proceeds to password input.')}
              >
                <Text style={styles.actionButtonText}>Next →</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.gestureHint}>
              Swipe left to go back{'\n'}
              Swipe down to go to Login
            </Text>
          </View>
        )}

        {/* Password Input View */}
        {view === VIEW.PASSWORD_INPUT && (
          <View style={styles.inputArea}>
            <Text style={styles.label}>Step 3 of 3 - Password:</Text>
            <Text style={styles.modeIndicator}>
              Mode: {inputMode?.toUpperCase() || 'Not selected'}
            </Text>

            {renderInputField(password, 'password', passwordInputRef)}

            {password.length > 0 && (
              <Text style={styles.emailPreview}>Password: {'*'.repeat(password.length)}</Text>
            )}

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[styles.actionButton, styles.backButton]}
                onPress={goBackToEmail}
                accessible={true}
                accessibilityLabel="Back button"
                accessibilityHint="Returns to email input"
                onFocus={() => speakOnFocus('Back button. Returns to email input.')}
              >
                <Text style={styles.actionButtonText}>← Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, styles.submitButton, (!password || password.length < 3) && styles.disabledButton]}
                onPress={handleFinalize}
                disabled={!password || password.length < 3 || loading}
                accessible={true}
                accessibilityLabel="Complete registration"
                accessibilityHint="Tap to complete registration"
                onFocus={() => speakOnFocus('Register button. Tap to complete registration.')}
              >
                {loading ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.actionButtonText}>Register</Text>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.gestureHint}>
              Swipe left to go back{'\n'}
              Swipe down to go to Login
            </Text>
          </View>
        )}

        {/* Loading indicator */}
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#6C63FF" />
            <Text style={styles.loadingText}>Creating your account...</Text>
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
  // Password input with eye icon (keyboard mode)
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  textInputWithIcon: {
    flex: 1,
  },
  eyeIconBtn: {
    position: 'absolute',
    right: 12,
    height: 44,
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  eyeIconText: {
    fontSize: 20,
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
