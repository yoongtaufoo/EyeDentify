import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isSpeechSupported, startRecording, stopRecording } from '../utils/whisper';

const VIEW = {
  CHECKING: 'CHECKING',
  MODE_PICKER: 'MODE_PICKER',
  EMAIL_INPUT: 'EMAIL_INPUT',
};

export default function LoginScreen({ }) {
  const { signIn, inputMode, setInputMode } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState(VIEW.CHECKING);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  // Two-step voice email state
  const [emailStep, setEmailStep] = useState(0);
  const [emailUsername, setEmailUsername] = useState('');
  const [emailDomain, setEmailDomain] = useState('');
  // Voice field tracking — which field are we recording into?
  const [recordingField, setRecordingField] = useState(''); // '' | 'email' | 'password'
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const savedEmail = localStorage.getItem('saved_email');
    const savedPw = localStorage.getItem('hidden_pw');

    if (savedEmail && savedPw) {
      // Auto-login with saved credentials
      handleAutoLogin(savedEmail, savedPw);
    } else {
      // Check if user has registered before
      if (savedEmail) {
        setView(VIEW.EMAIL_INPUT);
        setEmail(savedEmail);
        setError('Password not found. Please re-enter your password or register again.');
      } else {
        setView(VIEW.MODE_PICKER);
      }
    }
  }, []);

  const handleAutoLogin = async (targetEmail, pw) => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);

    try {
      await signIn(targetEmail, pw);
      console.log('[Login] Auto-login successful');
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('[Login] Auto-login error:', err);
      setEmail(targetEmail);
      setView(VIEW.MODE_PICKER);
      setError('Saved session expired. Please log in manually.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  const selectMode = (mode) => {
    setInputMode(mode);
    setView(VIEW.EMAIL_INPUT);
    speak(`Selected ${mode} mode.`);
  };

  const returnToModePicker = () => {
    setView(VIEW.MODE_PICKER);
    setEmail('');
    setPassword('');
    setError(null);
    speak('Returning to mode selection.');
  };

  /** Handle manual login with email + password */
  const handleManualLogin = async (e) => {
    e?.preventDefault();

    if (!email || email.length < 3) {
      setError('Please enter a valid email address.');
      speak('Please enter a valid email address.');
      return;
    }

    if (!password || password.length < 1) {
      setError('Password is required. If you forgot it, register a new account.');
      speak('Password is required.');
      return;
    }

    setLoading(true);
    setError(null);
    speak('Logging in...');

    try {
      await signIn(email, password);
      console.log('[Login] Manual login successful');
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('[Login] Error:', err);
      const msg = err.message || err.toString() || 'Login failed';
      setError(msg);
      speak('Login failed: ' + msg.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 50));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  /** Whisper voice recording — two-step email for audio mode */
  const startVoicePassword = async () => {
    if (!isSpeechSupported()) { setError('Microphone not supported.'); return; }
    setRecordingField('password'); setIsRecording(true);
    speak('Say your password now. Each character will be transcribed.');
    try { await startRecording(); }
    catch { setIsRecording(false); setRecordingField(''); }
  };

  const finishVoicePassword = async () => {
    setIsRecording(false); setRecordingField(''); speak('Processing...');
    try {
      const text = await stopRecording();
      if (text && text.trim()) {
        const cleaned = text.trim().replace(/\s+/g, ''); // passwords shouldn't have spaces
        setPassword(cleaned);
        speak(`Heard password: ${cleaned.split('').map(()=>'dot').join(', ')}. ${cleaned.length} characters.`);
      } else { speak('Could not hear your password. Please type it instead.'); }
    } catch (recErr) {
      setError('Speech recognition failed: ' + recErr.message); setIsRecording(false);
    }
  };

  const startVoiceEmailStep1 = async () => {
    if (!isSpeechSupported()) { setError('Microphone not supported.'); return; }
    setEmailStep(1); setEmailUsername(''); setEmailDomain('');
    setIsRecording(true);
    speak('Step 1 of 2. Say your email username. For example: john123 or alice_dot_smith');
    try { await startRecording(); }
    catch { setIsRecording(false); setEmailStep(0); }
  };

  const finishVoiceEmailStep1 = async () => {
    setIsRecording(false); speak('Processing...');
    try {
      const text = await stopRecording();
      if (text && text.trim()) {
        const cleaned = text.trim().replace(/[^a-zA-Z0-9._-]/g, '');
        setEmailUsername(cleaned);
        speak(`Heard username: ${cleaned}. Now step 2: say your provider, e.g., gmail dot com`);
        setEmailStep(2); setIsRecording(true);
        try { await startRecording(); }
        catch { setEmailStep(1); setIsRecording(false); }
      } else { speak('Could not hear your username. Try again.'); setEmailStep(0); }
    } catch (recErr) {
      setError('Speech recognition failed: ' + recErr.message); setEmailStep(0); setIsRecording(false);
    }
  };

  const finishVoiceEmailStep2 = async () => {
    setIsRecording(false); speak('Processing...');
    try {
      const text = await stopRecording();
      if (text && text.trim()) {
        let cleaned = text.trim().toLowerCase()
          .replace(/\s*dot\s*/g, '.').replace(/[^a-z0-9._-]/g, '');
        if (!cleaned.includes('.') && cleaned.length > 2) cleaned += '.com';
        setEmailDomain(cleaned);
        const fullEmail = `${emailUsername}@${cleaned}`;
        setEmail(fullEmail); setEmailStep(3);
        speak(`Email complete: ${fullEmail}. Now enter your password.`);
      } else { speak('Could not hear your provider. Try again.'); setEmailStep(1); }
    } catch (recErr) {
      setError('Speech recognition failed: ' + recErr.message); setEmailStep(0); setIsRecording(false);
    }
  };

  const toggleRecording = async () => {
    if (isRecording) {
      if (recordingField === 'password') await finishVoicePassword();
      else if (emailStep === 1) await finishVoiceEmailStep1();
      else if (emailStep === 2) await finishVoiceEmailStep2();
      else {
        setIsRecording(false); speak('Processing...');
        try {
          const text = await stopRecording();
          if (text && text.trim()) {
            const cleaned = text.toLowerCase()
              .replace(/at sign/gi, '@').replace(/\bat\b/g, '@')
              .replace(/\s*dot\s*/g, '.').replace(/[^a-z0-9@._\-\s]/gi, '').trim();
            setEmail(cleaned); speak('Heard: ' + cleaned);
          } else { speak('Could not understand speech.'); }
        } catch (recErr) { setError(recErr.message); setIsRecording(false); }
      }
    } else {
      if (inputMode === 'audio') { await startVoiceEmailStep1(); }
      else {
        if (!isSpeechSupported()) { setError('No microphone support.'); return; }
        setIsRecording(true); await startRecording(); speak('Listening... speak now.');
      }
    }
  };

  if (view === VIEW.CHECKING || loading && view === VIEW.CHECKING) {
    return (
      <div style={styles.container}>
        <div style={styles.checkingView}>
          <div style={styles.spinner} />
          <p style={styles.checkingText}>Checking for saved account...</p>
        </div>
        <style>{keyframesSpin}</style>
      </div>
    );
  }

  return (
    <div style={styles.container} role="main" aria-label="EyeDentify Login">
      <h1 style={styles.title} role="heading" aria-level={1}>EyeDentify</h1>

      {/* Error Banner */}
      {error && (
        <div style={styles.errorBanner} role="alert" aria-live="assertive">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} style={styles.dismissBtn} aria-label="Dismiss error message" onFocus={() => speak('Dismiss error button.')}>✕</button>
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
            onFocus={() => speak('Audio mode button. Select speech input mode.')}
          >
            🎤 AUDIO (Speech)
          </button>

          <button
            style={{ ...styles.modeButton, ...styles.brailleButton }}
            onClick={() => selectMode('braille')}
            aria-label="Select braille input mode"
            tabIndex={0}
            onFocus={() => speak('Braille mode button. Select braille dot grid input.')}
          >
            ⠏ BRAILLE INPUT
          </button>

          <button
            style={{ ...styles.modeButton, ...styles.keyboardButton }}
            onClick={() => selectMode('normal')}
            aria-label="Select keyboard input mode"
            tabIndex={0}
            onFocus={() => speak('Keyboard mode button. Select keyboard typing input.')}
          >
            ⌨ KEYBOARD
          </button>

          <p style={styles.hint} aria-live="polite">Selected mode: {inputMode || 'None'}</p>

          <button style={styles.registerLink} onClick={() => navigate('/signup')} aria-label="Go to registration page" tabIndex={0} onFocus={() => speak('Register link. Go to registration page.')}>
            Need an account? Register →
          </button>
        </div>
      )}

      {view === VIEW.EMAIL_INPUT && (
        <form onSubmit={handleManualLogin} style={styles.inputArea}>
          <p style={styles.label}>Enter your credentials:</p>
          <p style={styles.modeIndicator} aria-live="polite">Mode: {inputMode?.toUpperCase() || 'Not selected'}</p>

          {inputMode === 'braille' ? (
            <p style={{ color: '#6C63FF', margin: '10px 0' }}>Braille dot grid would appear here on mobile</p>
          ) : (
            <>
              <input
                type="email"
                style={styles.textInput}
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="your@email.com"
                autoFocus
                autoComplete="email"
                aria-label="Email address"
                tabIndex={0}
                onFocus={() => speak('Email input field. Type your email address.')}
              />
              <input
                type="password"
                style={styles.textInput}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                placeholder="Password (required)"
                autoComplete="current-password"
                aria-label="Password"
                tabIndex={0}
                onFocus={() => speak('Password input field. Type your password.')}
              />
              {/* Password voice input button — audio mode only */}
              {inputMode === 'audio' && (
                <div style={styles.fieldVoiceRow}>
                  <button type="button" onClick={startVoicePassword}
                    style={{ ...styles.fieldMicBtn, ...(recordingField==='password'?styles.fieldMicActive:{}), opacity: loading?0.5:1 }}
                    disabled={loading || isRecording && recordingField!=='password'}
                    aria-label="Speak your password"
                    onFocus={() => speak('Speak Password button. Tap to speak your password.')}
                  >
                    {recordingField==='password' ? '🔴 Stop' : '🎤 Speak Password'}
                  </button>
                  {recordingField==='password' && <p style={styles.recordingHint}>Say each character of your password...</p>}
                </div>
              )}
            </>
          )}

          {/* Voice Input — Two-step for audio mode */}
          {inputMode === 'audio' ? (
            <div style={styles.voiceArea}>
              {emailStep === 0 && (
                <p style={styles.stepHint} aria-live="polite">
                  Two-step voice email: username and domain recorded separately (no need to say "@").
                </p>
              )}
              {emailStep >= 1 && emailStep <= 2 && (
                <p style={styles.stepIndicator}>
                  Step {emailStep}/2: {emailStep === 1 ? 'Username (before @)' : 'Domain (after @)'}
                </p>
              )}
              {emailStep === 3 && (
                <p style={styles.stepComplete} aria-live="polite">
                  Email: <strong>{email}</strong>
                </p>
              )}
              <button type="button" onClick={toggleRecording}
                style={{ ...styles.voiceBtn, ...(isRecording ? styles.voiceBtnActive : {}),
                  opacity: loading || emailStep === 3 ? 0.5 : 1,
                  cursor: loading || emailStep === 3 ? 'not-allowed' : 'pointer',
                }}
                disabled={loading || emailStep === 3}
                aria-label={isRecording ? `Stop step ${emailStep}` : "Start voice email entry"}
                aria-pressed={isRecording} tabIndex={0}
                onFocus={() => speak(isRecording ? 'Stop recording button. Tap to stop.' : 'Speak Email button. Tap to start voice email entry.')}
              >
                {isRecording
                  ? (emailStep === 1 ? <>🔴 Stop — Listening for username...</>
                    : emailStep === 2 ? <>🔴 Stop — Listening for domain...</>
                    : <>🔴 Recording... Tap to stop</>)
                  : (emailStep === 3 ? <>Email Ready</>
                    : <>Speak Email (2 Steps)</>)
                }
              </button>
              {isRecording && emailStep === 1 && (
                <p style={styles.recordingHint}>Say your username now, e.g., "alice123"...</p>
              )}
              {isRecording && emailStep === 2 && (
                <p style={styles.recordingHint}>Say your provider now, e.g., "gmail dot com"...</p>
              )}
            </div>
          ) : null}

          {email && <p style={styles.emailPreview} aria-live="polite">Email: {email}</p>}

          <div style={styles.buttonRow}>
            <button
              type="button"
              style={{ ...styles.actionButton, ...styles.backButton }}
              onClick={returnToModePicker}
              disabled={loading}
              aria-label="Go back to method selection"
              tabIndex={0}
              onFocus={() => speak('Back button. Go back to input method selection.')}
            >
              ← Back
            </button>

            <button
              type="submit"
              style={{
                ...styles.actionButton,
                ...styles.submitButton,
                ...((!email || email.length < 3 || !password || loading) && styles.disabledButton)
              }}
              disabled={!email || email.length < 3 || !password || loading}
              aria-label={!password ? "Login button - password required" : "Submit login form"}
              tabIndex={0}
              onFocus={() => speak('Login button. Tap to submit and log in.')}
            >
              {loading ? 'Logging in...' : '🔑 Login'}
            </button>
          </div>

          <button type="button" style={styles.registerLink} onClick={() => navigate('/signup')} aria-label="Go to registration page" tabIndex={0} onFocus={() => speak('Register link. Go to registration page.')}>
            Don't have an account? → Register
          </button>
        </form>
      )}

      <style>{keyframesSpin}</style>
    </div>
  );
}

function speak(text) {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  }
}

const keyframesSpin = `@keyframes spin { to { transform: rotate(360deg); } }`;

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
    fontSize: 42,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 30,
    letterSpacing: 2,
  },
  checkingView: {
    alignItems: 'center',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '4px solid #333',
    borderTopColor: '#6C63FF',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  checkingText: {
    color: '#8E8EA0',
    fontSize: 16,
    marginTop: 20,
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
  dismissBtn: {
    background: 'none',
    border: 'none',
    color: '#FF8888',
    fontSize: 18,
    cursor: 'pointer',
    padding: '2px 6px',
  },
  modePicker: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
  },
  instruction: {
    color: '#8E8EA0',
    fontSize: 18,
    marginBottom: 30,
    textAlign: 'center',
  },
  modeButton: {
    width: '100%',
    height: 56,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: 'transparent',
    cursor: 'pointer',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    marginBottom: 12,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
  },
  audioButton: {
    backgroundColor: 'rgba(76, 175, 80, 0.15)',
    borderColor: '#4CAF50',
    color: '#4CAF50',
  },
  brailleButton: {
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderColor: '#6C63FF',
    color: '#6C63FF',
  },
  keyboardButton: {
    backgroundColor: 'rgba(255, 193, 7, 0.15)',
    borderColor: '#FFC107',
    color: '#FFC107',
  },
  hint: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  registerLink: {
    background: 'none',
    color: '#6C63FF',
    border: 'none',
    cursor: 'pointer',
    marginTop: 16,
    fontSize: 15,
    textDecoration: 'underline',
    fontFamily: 'inherit',
  },
  inputArea: {
    width: '100%',
    maxWidth: 400,
    display: 'flex',
    flexDirection: 'column',
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
    marginBottom: 18,
    fontWeight: 'bold',
  },
  textInput: {
    width: '100%',
    height: 48,
    backgroundColor: '#1A1A24',
    borderRadius: 12,
    padding: '14px 18px',
    color: '#FFFFFF',
    fontSize: 16,
    border: '1.5px solid #2A2A38',
    marginBottom: 14,
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s',
  },
  voiceArea: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    margin: '8px 0',
  },
  voiceBtn: {
    width: '100%',
    height: 50,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: '#4CAF50',
    background: 'rgba(76,175,80,0.08)',
    color: '#4CAF50',
    cursor: 'pointer',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceBtnActive: {
    background: 'rgba(255,60,60,0.15)',
    borderColor: '#FF4444',
    color: '#FF4444',
    animation: 'pulse 1.2s ease-in-out infinite',
  },
  recordingHint: {
    color: '#4CAF50',
    fontSize: 13,
    fontStyle: 'italic',
  },
  emailPreview: {
    color: '#8E8EA0',
    fontSize: 15,
    marginBottom: 18,
    textAlign: 'center',
  },
  // Per-field mic button (password, name)
  fieldVoiceRow: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  fieldMicBtn: {
    width: '100%',
    height: 36,
    borderRadius: 10,
    border: '1.5px solid #FF9800',
    background: 'rgba(255,152,0,0.08)',
    color: '#FF9800',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'inherit',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    transition: 'all 0.15s',
  },
  fieldMicActive: {
    background: 'rgba(255,60,60,0.12)',
    borderColor: '#FF4444',
    color: '#FF4444',
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    cursor: 'pointer',
    border: 'none',
    fontSize: 15,
    fontWeight: 'bold',
    fontFamily: 'inherit',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    background: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1.5,
    borderStyle: 'solid',
    borderColor: '#666',
    color: '#CCC',
  },
  submitButton: {
    background: '#6C63FF',
    borderWidth: 1.5,
    borderStyle: 'solid',
    borderColor: '#6C63FF',
    color: '#FFF',
  },
  disabledButton: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
  // Two-step voice email
  stepHint: { color: '#8E8EA0', fontSize: 13, textAlign: 'center', margin: '4px 0', lineHeight: 1.4 },
  stepIndicator: { color: '#6C63FF', fontSize: 14, fontWeight: 'bold', textAlign: 'center', margin: '6px 0' },
  stepComplete: { color: '#4ADE80', fontSize: 14, textAlign: 'center', margin: '6px 0' },
};
