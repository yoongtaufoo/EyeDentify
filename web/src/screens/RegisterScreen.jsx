import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isSpeechSupported, startRecording, stopRecording } from '../utils/whisper';

const VIEW = {
  MODE_PICKER: 'MODE_PICKER',
  EMAIL_INPUT: 'EMAIL_INPUT',
};

export default function RegisterScreen({ }) {
  const { signUpPasswordless, setInputMode, inputMode } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState(VIEW.MODE_PICKER);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  // Two-step voice email state
  const [emailStep, setEmailStep] = useState(0); // 0=idle, 1=recording username, 2=recording domain, 3=done
  const [emailUsername, setEmailUsername] = useState('');
  const [emailDomain, setEmailDomain] = useState('');
  // Voice field tracking — which field are we recording into?
  const [recordingField, setRecordingField] = useState(''); // '' | 'email' | 'name' | 'password'

  useEffect(() => {
    speak('Registration. Choose input method. Click Audio, Braille, or Keyboard.');
  }, []);

  const selectMode = (mode) => {
    setInputMode(mode);
    setView(VIEW.EMAIL_INPUT);

    if (mode === 'audio') speak('Audio mode selected. Enter your details below.');
    else if (mode === 'braille') speak('Braille mode selected. Use the dot grid to enter your email.');
    else speak('Keyboard mode selected. Type your details in the fields below.');
  };

  const returnToModePicker = () => {
    setView(VIEW.MODE_PICKER);
    setEmail('');
    setPassword('');
    setName('');
    setError(null);
    speak('Returning to mode selection.');
  };

  /* ── Voice recording for NAME field ── */
  const startVoiceName = async () => {
    if (!isSpeechSupported()) { setError('Microphone not supported.'); return; }
    setRecordingField('name'); setIsRecording(true);
    speak('Say your full name now.');
    try { await startRecording(); }
    catch { setIsRecording(false); setRecordingField(''); }
  };

  const finishVoiceName = async () => {
    setIsRecording(false); setRecordingField(''); speak('Processing...');
    try {
      const text = await stopRecording();
      if (text && text.trim()) {
        const cleaned = text.trim().replace(/[^a-zA-Z\s'-]/g, '');
        setName(cleaned);
        speak(`Heard name: ${cleaned}`);
      } else { speak('Could not hear your name. Please type it instead.'); }
    } catch (recErr) {
      setError('Speech recognition failed: ' + recErr.message); setIsRecording(false);
    }
  };

  /* ── Voice recording for PASSWORD field ── */
  const startVoicePassword = async () => {
    if (!isSpeechSupported()) { setError('Microphone not supported.'); return; }
    setRecordingField('password'); setIsRecording(true);
    speak('Say your password now. Speak each character clearly.');
    try { await startRecording(); }
    catch { setIsRecording(false); setRecordingField(''); }
  };

  const finishVoicePassword = async () => {
    setIsRecording(false); setRecordingField(''); speak('Processing...');
    try {
      const text = await stopRecording();
      if (text && text.trim()) {
        const cleaned = text.trim().replace(/\s+/g, '');
        setPassword(cleaned);
        speak(`Password heard: ${cleaned.length} characters.`);
      } else { speak('Could not hear your password. Please type it instead.'); }
    } catch (recErr) {
      setError('Speech recognition failed: ' + recErr.message); setIsRecording(false);
    }
  };

  /** Start two-step voice email: step 1 = username */
  const startVoiceEmailStep1 = async () => {
    if (!isSpeechSupported()) {
      setError('Microphone not supported in this browser.');
      return;
    }
    setEmailStep(1);
    setEmailUsername('');
    setEmailDomain('');
    setIsRecording(true);
    setRecordingField('email');
    speak('Step 1 of 2. Say your email username. For example: john123 or alice_dot_smith');
    try {
      await startRecording();
    } catch {
      setIsRecording(false);
      setRecordingField('');
      setEmailStep(0);
    }
  };

/** Finish step 1, start step 2 = domain */
  const finishVoiceEmailStep1 = async () => {
    setIsRecording(false);
    speak('Processing...');
    try {
      const text = await stopRecording();
      if (text && text.trim()) {
        const cleaned = text.trim().replace(/[^a-zA-Z0-9._-]/g, '');
        setEmailUsername(cleaned);
        speak(`Heard username: ${cleaned}. Now step 2: say your email provider. For example: gmail dot com or yahoo dot com`);
        // Immediately start step 2
        setEmailStep(2);
        setIsRecording(true);
        try {
          await startRecording();
        } catch {
          setEmailStep(1); // go back
          setIsRecording(false);
        }
      } else {
        speak('Could not hear your username. Please try again or type manually.');
        setEmailStep(0);
      }
    } catch (recErr) {
      console.error('[Register] Recording error:', recErr);
      setError('Speech recognition failed: ' + recErr.message);
      setEmailStep(0);
      setIsRecording(false);
    }
  };

  /** Finish step 2 — combine and set full email */
  const finishVoiceEmailStep2 = async () => {
    setIsRecording(false);
    speak('Processing...');
    try {
      const text = await stopRecording();
      if (text && text.trim()) {
        let cleaned = text.trim().toLowerCase()
          .replace(/\s*dot\s*/g, '.')
          .replace(/[^a-z0-9._-]/g, '');
        // Auto-prepend common domains with . if user just says "gmail"
        if (!cleaned.includes('.') && cleaned.length > 2) {
          cleaned += '.com';
        }
        setEmailDomain(cleaned);
        const fullEmail = `${emailUsername}@${cleaned}`;
        setEmail(fullEmail);
        setEmailStep(3);
        speak(`Email complete: ${fullEmail}. Now enter your password.`);
      } else {
        speak('Could not hear your provider. Please try again.');
        setEmailStep(1); // retry from step 1
      }
    } catch (recErr) {
      console.error('[Register] Recording error:', recErr);
      setError('Speech recognition failed: ' + recErr.message);
      setEmailStep(0);
      setIsRecording(false);
    }
  };

  /** Unified toggle for voice recording (dispatches to correct step) */
  const toggleRecording = async () => {
    if (isRecording) {
      // Which field are we recording into?
      if (recordingField === 'name') await finishVoiceName();
      else if (recordingField === 'password') await finishVoicePassword();
      else if (emailStep === 1) await finishVoiceEmailStep1();
      else if (emailStep === 2) await finishVoiceEmailStep2();
      else {
        // Legacy single-step fallback (keyboard mode recording)
        setIsRecording(false);
        speak('Processing...');
        try {
          const text = await stopRecording();
          if (text && text.trim()) {
            const cleaned = text.toLowerCase()
              .replace(/at sign/gi, '@').replace(/\bat\b/g, '@')
              .replace(/\s*dot\s*/g, '.')
              .replace(/[^a-z0-9@._\-\s]/gi, '').trim();
            setEmail(cleaned);
            speak('Heard: ' + cleaned);
          } else {
            speak('Could not understand speech. Please type instead.');
          }
        } catch (recErr) {
          setError('Speech recognition failed: ' + recErr.message);
          setIsRecording(false);
        }
      }
    } else {
      // Start recording based on mode
      if (inputMode === 'audio') {
        await startVoiceEmailStep1();
      } else {
        try {
          if (!isSpeechSupported()) { setError('Microphone not supported.'); return; }
          setIsRecording(true);
          await startRecording();
          speak('Listening... speak your email now.');
        } catch { setIsRecording(false); }
      }
    }
  };

  const handleFinalize = async (e) => {
    e?.preventDefault();
    if (!email || email.length < 3 || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    // Password validation
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    setError(null);
    speak('Creating your account...');

    try {
      await signUpPasswordless(email.trim(), name.trim() || 'New User', inputMode || 'normal', password);
      speak('Account created successfully!');
    } catch (err) {
      console.error('[Register] Error:', err);
      const msg = err.message || err.toString() || 'Registration failed';
      setError(msg);
      speak('Registration failed: ' + msg.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 50));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container} role="main" aria-label="EyeDentify Registration">
      <h1 style={styles.title} role="heading" aria-level={1}>REGISTER</h1>

      {/* Error Banner */}
      {error && (
        <div style={styles.errorBanner} role="alert" aria-live="assertive">
          <span>{error}</span>
          <button onClick={() => setError(null)} style={styles.dismissBtn} aria-label="Dismiss error message">x</button>
        </div>
      )}

      {view === VIEW.MODE_PICKER && (
        <div style={styles.modePicker} role="group" aria-label="Input method selection">
          <p style={styles.instruction}>Choose input method:</p>

          <button
            style={{ ...styles.modeButton, ...styles.audioButton }}
            onClick={() => selectMode('audio')}
            aria-label="Select audio speech input mode"
            tabIndex={0}
            onFocus={() => speak('Audio input mode. Press Enter to select voice input.')}
          >
            🎤 AUDIO (Speech)
          </button>

          <button
            style={{ ...styles.modeButton, ...styles.brailleButton }}
            onClick={() => selectMode('braille')}
            aria-label="Select braille input mode"
            tabIndex={0}
            onFocus={() => speak('Braille input mode. Press Enter to select braille dot grid input.')}
          >
            ⠏ BRAILLE INPUT
          </button>

          <button
            style={{ ...styles.modeButton, ...styles.keyboardButton }}
            onClick={() => selectMode('normal')}
            aria-label="Select keyboard input mode"
            tabIndex={0}
            onFocus={() => speak('Keyboard input mode. Press Enter to select keyboard typing.')}
          >
            ⌨ KEYBOARD
          </button>

          <p style={styles.hint} aria-live="polite">Selected mode: {inputMode || 'None'}</p>

          <button style={styles.loginLink} onClick={() => navigate('/login')} aria-label="Go to login page" tabIndex={0}
            onFocus={() => speak('Already have an account? Press Enter to go to Login.')}
          >
            Already have account? Login
          </button>
        </div>
      )}

      {view === VIEW.EMAIL_INPUT && (
        <form onSubmit={handleFinalize} style={styles.inputArea}>
          <p style={styles.label}>Create your account:</p>
          <p style={styles.modeIndicator} aria-live="polite">Mode: {inputMode?.toUpperCase() || 'Not selected'}</p>

          {inputMode === 'braille' ? (
            <p style={{ color: '#6C63FF', margin: '10px 0' }}>Braille dot grid would appear here on mobile</p>
          ) : (
            <>
              <input
                type="text"
                style={styles.textInput}
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                placeholder="Full Name (optional)"
                autoComplete="name"
                aria-label="Full name (optional)"
                tabIndex={0}
                onFocus={() => speak('Full name input field. Type your full name or use the Speak Name button below.')}
              />
              {/* Name voice input button */}
              {(inputMode === 'audio' || true) && (
                <div style={styles.fieldVoiceRow}>
                  <button type="button" onClick={startVoiceName}
                    style={{ ...styles.fieldMicBtn, ...(recordingField==='name'?styles.fieldMicActive:{}), opacity: loading?0.5:1 }}
                    disabled={loading || (isRecording && recordingField!=='name')}
                    aria-label="Speak your name"
                    onFocus={() => speak('Speak Name button. Press Enter to start recording your name.')}
                  >
                    {recordingField==='name' ? '🔴 Stop' : '🎤 Speak Name'}
                  </button>
                  {recordingField==='name' && <p style={styles.recordingHint}>Say your full name now...</p>}
                </div>
              )}

              <input
                type="email"
                style={styles.textInput}
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="your@email.com"
                autoComplete="email"
                autoFocus
                aria-label="Email address"
                tabIndex={0}
                onFocus={() => speak('Email input field. Type your email address.')}
              />

              <input
                type="password"
                style={styles.textInput}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                placeholder="Password (min 6 characters)"
                autoComplete="new-password"
                aria-label="Password, minimum 6 characters"
                tabIndex={0}
                onFocus={() => speak('Password input field. Type your password, minimum 6 characters.')}
              />
              {/* Password voice input button */}
              {(inputMode === 'audio' || true) && (
                <div style={styles.fieldVoiceRow}>
                  <button type="button" onClick={startVoicePassword}
                    style={{ ...styles.fieldMicBtn, ...(recordingField==='password'?styles.fieldMicActive:{}), opacity: loading?0.5:1 }}
                    disabled={loading || (isRecording && recordingField!=='password')}
                    aria-label="Speak your password"
                    onFocus={() => speak('Speak Password button. Press Enter to start recording your password.')}
                  >
                    {recordingField==='password' ? '🔴 Stop' : '🎤 Speak Password'}
                  </button>
                  {recordingField==='password' && <p style={styles.recordingHint}>Say each character of your password...</p>}
                </div>
              )}
            </>
          )}

          {/* Voice Input — Two-step for audio mode */}
          {inputMode === 'audio' && (
            <div style={styles.voiceArea}>
              {/* Step indicator */}
              {emailStep === 0 && (
                <p style={styles.stepHint} aria-live="polite">
                  Two-step voice email entry will ask for username and domain separately (easier than saying "@").
                </p>
              )}
              {emailStep >= 1 && emailStep <= 2 && (
                <p style={styles.stepIndicator}>
                  Step {emailStep}/2: {emailStep === 1 ? '🎤 Username (before @)' : '🎤 Domain (after @)'}
                </p>
              )}
              {emailStep === 3 && (
                <p style={styles.stepComplete} aria-live="polite">
                  Email assembled: <strong>{email}</strong>
                </p>
              )}

              <button
                type="button"
                onClick={toggleRecording}
                style={{
                  ...styles.voiceBtn,
                  ...(isRecording ? styles.voiceBtnActive : {}),
                  opacity: loading || emailStep === 3 ? 0.5 : 1,
                  cursor: loading || emailStep === 3 ? 'not-allowed' : 'pointer',
                }}
                disabled={loading || emailStep === 3}
                aria-label={isRecording
                  ? `Stop recording step ${emailStep}`
                  : "Start two-step voice email entry"
                }
                aria-pressed={isRecording}
                tabIndex={0}
                onFocus={() => speak(isRecording ? `Recording in progress, step ${emailStep}. Press Enter to stop.` : 'Speak Email button. Press Enter to start two-step voice email entry.')}
              >
                {isRecording
                  ? (emailStep === 1 ? <>🔴 Stop — Listening for username...</>
                    : emailStep === 2 ? <>🔴 Stop — Listening for domain...</>
                    : <>🔴 Stop & Transcribe</>)
                  : (emailStep === 3 ? <>✓ Email Ready</>
                    : <>🎤 Speak Email (2 Steps)</>)
                }
              </button>
              {isRecording && emailStep === 1 && (
                <p style={styles.recordingHint}>Say your username now (e.g., "alice123")...</p>
              )}
              {isRecording && emailStep === 2 && (
                <p style={styles.recordingHint}>Say your provider now (e.g., "gmail dot com")...</p>
              )}
            </div>
          )}

          {email && <p style={styles.emailPreview} aria-live="polite">Email: {email}</p>}

          <div style={styles.buttonRow}>
            <button
              type="button"
              style={{ ...styles.actionButton, ...styles.backButton }}
              onClick={returnToModePicker}
              disabled={loading}
              aria-label="Go back to method selection"
              tabIndex={0}
              onFocus={() => speak('Back button. Press Enter to return to input method selection.')}
            >
              ← Back
            </button>

            <button
              type="submit"
              style={{
                ...styles.actionButton,
                ...styles.submitButton,
                ...((!email || email.length < 3 || !password || password.length < 6 || loading) && styles.disabledButton),
              }}
              disabled={!email || email.length < 3 || !password || password.length < 6 || loading}
              aria-label={!password || password.length < 6 ? "Create account button - need valid email and password" : "Create new account"}
              tabIndex={0}
              onFocus={() => speak(!password || password.length < 6 ? 'Create Account button is disabled. Please fill in a valid email and password first.' : 'Create Account button. Press Enter to create your account.')}
            >
              {loading ? 'Creating...' : '✓ Create Account'}
            </button>
          </div>

          <button type="button" style={styles.loginLink} onClick={() => navigate('/login')} aria-label="Go to login page" tabIndex={0}
            onFocus={() => speak('Already have an account? Press Enter to go to Login.')}
          >
            Already have an account? → Login
          </button>
        </form>
      )}
    </div>
  );
}

function speak(text) {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    speechSynthesis.speak(u);
  }
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: '100vh',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 30,
    letterSpacing: 1.5,
  },
  errorBanner: {
    width: '100%',
    maxWidth: 420,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'rgba(255,60,60,0.12)',
    border: '1px solid rgba(255,60,60,0.3)',
    borderRadius: 12,
    padding: '12px 16px',
    color: '#FF8888',
    fontSize: 14,
    marginBottom: 16,
    boxSizing: 'border-box',
  },
  dismissBtn: { background: 'none', border: 'none', color: '#FF8888', fontSize: 18, cursor: 'pointer', padding: '2px 6px' },
  modePicker: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
  },
  instruction: { color: '#8E8EA0', fontSize: 18, marginBottom: 30, textAlign: 'center' },
  modeButton: {
    width: '100%', height: 56, borderRadius: 14,
    marginBottom: 12, cursor: 'pointer', fontSize: 16, fontWeight: 'bold',
    fontFamily: 'inherit', transition: 'all 0.15s',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderStyle: 'solid', borderColor: 'transparent',
  },
  audioButton: { backgroundColor: 'rgba(76,175,80,0.15)', borderColor: '#4CAF50', color: '#4CAF50' },
  brailleButton: { backgroundColor: 'rgba(108,99,255,0.15)', borderColor: '#6C63FF', color: '#6C63FF' },
  keyboardButton: { backgroundColor: 'rgba(255,193,7,0.15)', borderColor: '#FFC107', color: '#FFC107' },
  hint: { color: '#666', fontSize: 14, textAlign: 'center', marginTop: 20 },
  loginLink: {
    background: 'none', color: '#6C63FF', border: 'none', cursor: 'pointer',
    marginTop: 16, fontSize: 15, textDecoration: 'underline', fontFamily: 'inherit',
  },
  inputArea: {
    width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  label: { color: '#FFFFFF', fontSize: 20, marginBottom: 10, fontWeight: '600' },
  modeIndicator: { color: '#6C63FF', fontSize: 16, marginBottom: 18, fontWeight: 'bold' },
  textInput: {
    width: '100%', height: 48, backgroundColor: '#1A1A24', borderRadius: 12,
    padding: '14px 18px', color: '#FFFFFF', fontSize: 16,
    borderBottom: '2px solid #2A2A38', marginBottom: 14, boxSizing: 'border-box',
    outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.2s',
  },
  voiceArea: { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, margin: '6px 0' },
  voiceBtn: {
    width: '100%', height: 48, borderRadius: 14,
    borderWidth: 2, borderStyle: 'solid', borderColor: '#4CAF50',
    background: 'rgba(76,175,80,0.08)', color: '#4CAF50', cursor: 'pointer',
    fontSize: 15, fontWeight: '600', fontFamily: 'inherit', transition: 'all 0.15s',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
  },
  voiceBtnActive: { background: 'rgba(255,60,60,0.15)', borderColor: '#FF4444', color: '#FF4444' },
  recordingHint: { color: '#4CAF50', fontSize: 13, fontStyle: 'italic' },
  emailPreview: { color: '#8E8EA0', fontSize: 15, marginBottom: 18, textAlign: 'center' },
  // Per-field mic buttons (name, password)
  fieldVoiceRow: {
    width: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 6, marginBottom: 10,
  },
  fieldMicBtn: {
    width: '100%', height: 36, borderRadius: 10,
    border: '1.5px solid #FF9800',
    background: 'rgba(255,152,0,0.08)', color: '#FF9800',
    cursor: 'pointer', fontSize: 13, fontWeight: '600', fontFamily: 'inherit',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    transition: 'all 0.15s',
  },
  fieldMicActive: {
    background: 'rgba(255,60,60,0.12)',
    borderColor: '#FF4444', color: '#FF4444',
  },
  buttonRow: { display: 'flex', justifyContent: 'space-between', width: '100%', gap: 12, marginBottom: 12 },
  actionButton: {
    flex: 1, height: 48, borderRadius: 12, cursor: 'pointer',
    fontSize: 15, fontWeight: 'bold', fontFamily: 'inherit',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
  },
  backButton: { backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderStyle: 'solid', borderColor: '#666', color: '#CCC' },
  submitButton: { backgroundColor: '#6C63FF', borderWidth: 1, borderStyle: 'solid', borderColor: '#6C63FF', color: '#FFF' },
  disabledButton: { opacity: 0.35, cursor: 'not-allowed' },
  // Two-step voice email styles
  stepHint: { color: '#8E8EA0', fontSize: 13, textAlign: 'center', margin: '4px 0', lineHeight: 1.4 },
  stepIndicator: { color: '#6C63FF', fontSize: 14, fontWeight: 'bold', textAlign: 'center', margin: '6px 0' },
  stepComplete: { color: '#4ADE80', fontSize: 14, textAlign: 'center', margin: '6px 0' },
};
