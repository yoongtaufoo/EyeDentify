import { useState, useEffect, useRef } from 'react';
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
  // Two-step voice email state
  const [emailStep, setEmailStep] = useState(0);
  const [emailUsername, setEmailUsername] = useState('');
  const [emailDomain, setEmailDomain] = useState('');
  // Independent recording states per field — fixes cross-button interference
  const [recordingField, setRecordingField] = useState(''); // '' | 'email' | 'password'
  const [isRecordingEmail, setIsRecordingEmail] = useState(false);
  const [isRecordingPassword, setIsRecordingPassword] = useState(false);
  // Password visibility (eye icon)
  const [showPassword, setShowPassword] = useState(false);
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
    setRecordingField('password');
    speak('Say your password now. Each character will be transcribed.');
    try {
      await startRecording();
      setIsRecordingPassword(true);
    } catch {
      setIsRecordingPassword(false); setRecordingField('');
    }
  };

  const toggleVoicePassword = async () => {
    if (recordingField === 'password' && isRecordingPassword) {
      // Currently recording password → STOP it
      await finishVoicePassword();
    } else {
      // Not recording password → START it
      await startVoicePassword();
    }
  };

  const finishVoicePassword = async () => {
    setIsRecordingPassword(false); setRecordingField(''); speak('Processing...');
    try {
      const text = await stopRecording();
      if (text && text.trim()) {
        const cleaned = text.trim().replace(/\s+/g, ''); // passwords shouldn't have spaces
        setPassword(cleaned);
        speak(`Heard password: ${cleaned.split('').map(()=>'dot').join(', ')}. ${cleaned.length} characters.`);
      } else { speak('Could not hear your password. Please type it instead.'); }
    } catch (recErr) {
      setError('Speech recognition failed: ' + recErr.message); setIsRecordingPassword(false);
    }
  };

  const startVoiceEmailStep1 = async () => {
    if (!isSpeechSupported()) { setError('Microphone not supported.'); return; }
    setEmailStep(1); setEmailUsername(''); setEmailDomain('');
    setIsRecordingEmail(true);
    speak('Step 1 of 2. Say your email username. For example: john123 or alice_dot_smith');
    try { await startRecording(); }
    catch { setIsRecordingEmail(false); setEmailStep(0); }
  };

  const finishVoiceEmailStep1 = async () => {
    setIsRecordingEmail(false); speak('Processing...');
    try {
      const text = await stopRecording();
      if (text && text.trim()) {
        const cleaned = text.trim().replace(/[^a-zA-Z0-9._-]/g, '');
        setEmailUsername(cleaned);
        speak(`Heard username: ${cleaned}. Now step 2: say your provider, e.g., gmail dot com`);
        setEmailStep(2); setIsRecordingEmail(true);
        try { await startRecording(); }
        catch { setEmailStep(1); setIsRecordingEmail(false); }
      } else { speak('Could not hear your username. Try again.'); setEmailStep(0); }
    } catch (recErr) {
      setError('Speech recognition failed: ' + recErr.message); setEmailStep(0); setIsRecordingEmail(false);
    }
  };

  const finishVoiceEmailStep2 = async () => {
    setIsRecordingEmail(false); speak('Processing...');
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
      setError('Speech recognition failed: ' + recErr.message); setEmailStep(0); setIsRecordingEmail(false);
    }
  };

  const toggleRecording = async () => {
    if (isRecordingEmail) {
      if (emailStep === 1) await finishVoiceEmailStep1();
      else if (emailStep === 2) await finishVoiceEmailStep2();
      else {
        setIsRecordingEmail(false); speak('Processing...');
        try {
          const text = await stopRecording();
          if (text && text.trim()) {
            const cleaned = text.toLowerCase()
              .replace(/at sign/gi, '@').replace(/\bat\b/g, '@')
              .replace(/\s*dot\s*/g, '.').replace(/[^a-z0-9@._\-\s]/gi, '').trim();
            setEmail(cleaned); speak('Heard: ' + cleaned);
          } else { speak('Could not understand speech.'); }
        } catch (recErr) { setError(recErr.message); setIsRecordingEmail(false); }
      }
    } else {
      if (inputMode === 'audio') {
        if (emailStep === 3) setEmailStep(0); // allow re-recording
        await startVoiceEmailStep1();
      } else {
        if (!isSpeechSupported()) { setError('No microphone support.'); return; }
        setIsRecordingEmail(true); await startRecording(); speak('Listening... speak now.');
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
      <h1 style={styles.title} role="heading" aria-level={1}>
        <span style={styles.titleIcon}>{'\u{1F441}\uFE0F'}</span>
        EyeDentify
      </h1>
      <p style={styles.subtitle}>Sign in to continue</p>

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
            <p style={{ color: '#7C4DFF', margin: '10px 0', fontSize: 13, lineHeight: 1.5 }}>
              In real implementation, braille user can connect real braille input keyboard to type
            </p>
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
                onFocus={() => speak('Email input. Type your email address.')}
              />

              {/* Voice Input — Two-step for audio mode (RIGHT BELOW EMAIL INPUT) */}
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
                    style={{ ...styles.voiceBtn, ...(isRecordingEmail ? styles.voiceBtnActive : {}),
                      opacity: loading ? 0.5 : 1,
                      cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                    disabled={loading}
                    aria-label={isRecordingEmail ? `Stop step ${emailStep}` : "Start voice email entry"}
                    aria-pressed={isRecordingEmail} tabIndex={0}
                    onFocus={() => speak(isRecordingEmail ? 'Stop recording button. Tap to stop.' : 'Speak Email button. Tap to start voice email entry.')}
                  >
                    {isRecordingEmail
                      ? (emailStep === 1 ? <>🔴 Stop — Listening for username...</>
                        : emailStep === 2 ? <>🔴 Stop — Listening for domain...</>
                        : <>🔴 Recording... Tap to stop</>)
                      : (emailStep === 3 ? <>✓ Re-record Email</>
                        : <>🎤 Speak Email (2 Steps)</>)
                    }
                  </button>
                  {isRecordingEmail && emailStep === 1 && (
                    <p style={styles.recordingHint}>Say your username now, e.g., "alice123"...</p>
                  )}
                  {isRecordingEmail && emailStep === 2 && (
                    <p style={styles.recordingHint}>Say your provider now, e.g., "gmail dot com"...</p>
                  )}
                </div>
              ) : null}

              <input
                type={showPassword ? 'text' : 'password'}
                style={styles.textInput}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                placeholder="Password (required)"
                autoComplete="current-password"
                aria-label="Password"
                tabIndex={0}
                onFocus={() => speak('Password input. Type your password.')}
              />
              {/* Password visibility toggle + voice input — audio mode */}
              <div style={styles.passwordActionRow}>
                {/* Eye icon to show/hide transcribed password */}
                {password && (
                  <button type="button" onClick={() => { setShowPassword(!showPassword); speak(showPassword ? 'Password hidden.' : `Password revealed: ${password.split('').map(()=>'dot').join(', ')}. ${password.length} characters.`); }}
                    style={styles.eyeBtn}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    tabIndex={0}
                  >
                    {showPassword ? '🙈 Hide' : '👁 Show'}
                  </button>
                )}
                {/* Password voice input button — audio mode only */}
                {inputMode === 'audio' && (
                  <button type="button" onClick={toggleVoicePassword}
                    style={{ ...styles.fieldMicBtn, ...(recordingField==='password' && isRecordingPassword ? styles.fieldMicActive:{}), opacity: loading || (isRecordingPassword && recordingField !== 'password') ? 0.5 : 1 }}
                    disabled={loading || (isRecordingPassword && recordingField !== 'password')}
                    aria-label={recordingField==='password' && isRecordingPassword ? "Stop password recording" : "Speak your password"}
                    tabIndex={0}
                    onFocus={() => speak(recordingField==='password' && isRecordingPassword ? 'Stop Password button. Tap to stop recording.' : 'Speak Password button. Tap to speak your password.')}
                  >
                    {recordingField==='password' && isRecordingPassword ? '🔴 Stop Password' : '🎤 Speak Password'}
                  </button>
                )}
                {recordingField==='password' && isRecordingPassword && <p style={styles.recordingHint}>Say each character of your password...</p>}
              </div>
            </>
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
    backgroundColor: '#F7F7F7',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: '100vh',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  title: {
    fontSize: 36,
    fontWeight: 800,
    color: '#222',
    marginBottom: 8,
    letterSpacing: -0.5,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  titleIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #F5A623, #FF8C00)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 20,
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    marginBottom: 28,
    textAlign: 'center',
  },
  checkingView: {
    alignItems: 'center',
  },
  spinner: {
    width: 40,
    height: 40,
    border: '4px solid #E8E8E8',
    borderTopColor: '#F5A623',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  checkingText: {
    color: '#888',
    fontSize: 15,
    marginTop: 20,
    fontWeight: 500,
  },
  errorBanner: {
    width: '100%',
    maxWidth: 420,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#FFF0EE',
    border: '1px solid rgba(217,74,74,0.2)',
    borderRadius: 12,
    padding: '12px 16px',
    color: '#D94A4A',
    fontSize: 14,
    marginBottom: 16,
    boxSizing: 'border-box',
  },
  dismissBtn: {
    background: 'none',
    border: 'none',
    color: '#D94A4A',
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
    color: '#555',
    fontSize: 17,
    fontWeight: 600,
    marginBottom: 24,
    textAlign: 'center',
  },
  modeButton: {
    width: '100%',
    height: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'solid',
    borderColor: '#EEE',
    cursor: 'pointer',
    fontSize: 15,
    fontWeight: 700,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    transition: 'all 0.15s',
    marginBottom: 11,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    backgroundColor: '#FFFFFF',
    color: '#444',
  },
  audioButton: {
    borderColor: '#4CAF50',
    background: '#F8FFF8',
    color: '#2E7D32',
  },
  brailleButton: {
    borderColor: '#7C4DFF',
    background: '#F8F5FF',
    color: '#5C3FD4',
  },
  keyboardButton: {
    borderColor: '#F5A623',
    background: '#FFF8EE',
    color: '#B07800',
  },
  hint: {
    color: '#AAA',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 18,
  },
  registerLink: {
    background: 'none',
    color: '#F5A623',
    border: 'none',
    cursor: 'pointer',
    marginTop: 18,
    fontSize: 14,
    textDecoration: 'none',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontWeight: 600,
    padding: '8px 0',
  },
  inputArea: {
    width: '100%',
    maxWidth: 400,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: '28px 24px',
    border: '1px solid #EEE',
    boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
  },
  label: {
    color: '#222',
    fontSize: 17,
    marginBottom: 14,
    fontWeight: 700,
    alignSelf: 'flex-start',
  },
  modeIndicator: {
    color: '#F5A623',
    fontSize: 13,
    marginBottom: 16,
    fontWeight: 700,
    alignSelf: 'flex-start',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    width: '100%',
    height: 48,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: '14px 16px',
    color: '#222',
    fontSize: 15,
    border: '1.5px solid #EEE',
    marginBottom: 12,
    boxSizing: 'border-box',
    outline: 'none',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    transition: 'border-color 0.2s',
  },
  voiceArea: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    margin: '6px 0',
  },
  voiceBtn: {
    width: '100%',
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'solid',
    borderColor: '#4CAF50',
    background: '#F8FFF8',
    color: '#2E7D32',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    transition: 'all 0.15s',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceBtnActive: {
    background: '#FFF0EE',
    borderColor: '#D94A4A',
    color: '#D94A4A',
    animation: 'pulse 1.2s ease-in-out infinite',
  },
  recordingHint: {
    color: '#2E7D32',
    fontSize: 12,
    fontStyle: 'italic',
  },
  emailPreview: {
    color: '#888',
    fontSize: 13,
    marginBottom: 16,
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
  passwordActionRow: {
    width: '100%',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  eyeBtn: {
    height: 36,
    padding: '0 14px',
    borderRadius: 10,
    border: '1.5px solid #F5A623',
    background: '#FFF8EE',
    color: '#B07800',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    transition: 'all 0.15s',
  },
  fieldMicBtn: {
    width: '100%',
    height: 36,
    borderRadius: 10,
    border: '1.5px solid #FF9800',
    background: '#FFF8EE',
    color: '#B07800',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    transition: 'all 0.15s',
  },
  fieldMicActive: {
    background: '#FFF0EE',
    borderColor: '#D94A4A',
    color: '#D94A4A',
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
    fontWeight: 700,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    background: '#F5F5F5',
    borderWidth: 1.5,
    borderStyle: 'solid',
    borderColor: '#E0E0E0',
    color: '#666',
  },
  submitButton: {
    background: 'linear-gradient(135deg, #F5A623, #FF8C00)',
    borderWidth: 1.5,
    borderStyle: 'solid',
    borderColor: '#F5A623',
    color: '#FFF',
    boxShadow: '0 3px 12px rgba(245,166,35,0.3)',
  },
  disabledButton: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
  // Two-step voice email
  stepHint: { color: '#888', fontSize: 13, textAlign: 'center', margin: '4px 0', lineHeight: 1.4 },
  stepIndicator: { color: '#F5A623', fontSize: 13, fontWeight: 'bold', textAlign: 'center', margin: '6px 0' },
  stepComplete: { color: '#4CAF50', fontSize: 13, textAlign: 'center', margin: '6px 0' },
};
