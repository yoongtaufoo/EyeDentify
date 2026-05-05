import { useState, useEffect, useRef } from 'react';
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
  // Two-step voice email state
  const [emailStep, setEmailStep] = useState(0); // 0=idle, 1=recording username, 2=recording domain, 3=done
  const [emailUsername, setEmailUsername] = useState('');
  const [emailDomain, setEmailDomain] = useState('');
  // Independent recording states per field — fixes cross-button interference
  const [recordingField, setRecordingField] = useState(''); // '' | 'email' | 'name' | 'password'
  const [isRecordingEmail, setIsRecordingEmail] = useState(false);
  const [isRecordingName, setIsRecordingName] = useState(false);
  const [isRecordingPassword, setIsRecordingPassword] = useState(false);
  // Password visibility (eye icon)
  const [showPassword, setShowPassword] = useState(false);
  // Auto-stop timer ref for voice recordings
  const recordingTimerRef = useRef(null);

  useEffect(() => {
    speak('Registration. Choose input method. Click Audio, Braille, or Keyboard.');
    // Cleanup recording timers on unmount
    return () => {
      if (recordingTimerRef.current) {
        clearTimeout(recordingTimerRef.current);
      }
    };
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
  const toggleVoiceName = async () => {
    if (isRecordingName && recordingField === 'name') {
      // Currently recording name → STOP
      await finishVoiceName();
    } else {
      // Not recording → START
      await startVoiceName();
    }
  };

  const startVoiceName = async () => {
    if (!isSpeechSupported()) { setError('Microphone not supported.'); return; }
    setRecordingField('name'); setIsRecordingName(true);
    speak('Say your full name now.');
    try {
      await startRecording();
      // Auto-stop after 10 seconds — names should be short
      recordingTimerRef.current = setTimeout(async () => {
        if (recordingField === 'name') {
          speak('Time\'s up. Processing name...');
          await finishVoiceName();
        }
      }, 10000);
    } catch { setIsRecordingName(false); setRecordingField(''); }
  };

  const finishVoiceName = async () => {
    // Clear auto-stop timer if manually stopped
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecordingName(false); setRecordingField(''); speak('Processing...');
    try {
      const text = await stopRecording();
      if (text && text.trim()) {
        const cleaned = text.trim().replace(/[^a-zA-Z\s'-]/g, '');
        setName(cleaned);
        speak(`Heard name: ${cleaned}`);
      } else { speak('Could not hear your name. Please type it instead.'); }
    } catch (recErr) {
      setError('Speech recognition failed: ' + recErr.message); setIsRecordingName(false);
    }
  };

  /* ── Voice recording for PASSWORD field ── */
  const toggleVoicePassword = async () => {
    if (isRecordingPassword && recordingField === 'password') {
      // Currently recording password → STOP
      await finishVoicePassword();
    } else {
      // Not recording → START
      await startVoicePassword();
    }
  };

  const startVoicePassword = async () => {
    if (!isSpeechSupported()) { setError('Microphone not supported.'); return; }
    setRecordingField('password'); setIsRecordingPassword(true);
    speak('Say your password now. Speak each character clearly.');
    try {
      await startRecording();
      // Auto-stop after 8 seconds — passwords should be short
      recordingTimerRef.current = setTimeout(async () => {
        if (recordingField === 'password') {
          speak('Time\'s up. Processing password...');
          await finishVoicePassword();
        }
      }, 8000);
    } catch { setIsRecordingPassword(false); setRecordingField(''); }
  };

  const finishVoicePassword = async () => {
    // Clear auto-stop timer if manually stopped
    if (recordingTimerRef.current) {
      clearTimeout(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecordingPassword(false); setRecordingField(''); speak('Processing...');
    try {
      const text = await stopRecording();
      if (text && text.trim()) {
        const cleaned = text.trim().replace(/\s+/g, '');
        setPassword(cleaned);
        speak(`Password heard: ${cleaned}. ${cleaned.length} characters.`);
      } else { speak('Could not hear your password. Please type it instead.'); }
    } catch (recErr) {
      setError('Speech recognition failed: ' + recErr.message); setIsRecordingPassword(false);
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
    setIsRecordingEmail(true);
    setRecordingField('email');
    speak('Step 1 of 2. Say your email username. For example: john123 or alice_dot_smith');
    try {
      await startRecording();
    } catch {
      setIsRecordingEmail(false);
      setRecordingField('');
      setEmailStep(0);
    }
  };

/** Finish step 1, start step 2 = domain */
  const finishVoiceEmailStep1 = async () => {
    setIsRecordingEmail(false);
    speak('Processing...');
    try {
      const text = await stopRecording();
      if (text && text.trim()) {
        const cleaned = text.trim().replace(/[^a-zA-Z0-9._-]/g, '');
        setEmailUsername(cleaned);
        speak(`Heard username: ${cleaned}. Now step 2: say your email provider. For example: gmail dot com or yahoo dot com`);
        // Immediately start step 2
        setEmailStep(2);
        setIsRecordingEmail(true);
        try {
          await startRecording();
        } catch {
          setEmailStep(1); // go back
          setIsRecordingEmail(false);
        }
      } else {
        speak('Could not hear your username. Please try again or type manually.');
        setEmailStep(0);
      }
    } catch (recErr) {
      console.error('[Register] Recording error:', recErr);
      setError('Speech recognition failed: ' + recErr.message);
      setEmailStep(0);
      setIsRecordingEmail(false);
    }
  };

  /** Finish step 2 — combine and set full email */
  const finishVoiceEmailStep2 = async () => {
    setIsRecordingEmail(false);
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
      setIsRecordingEmail(false);
    }
  };

  /** Unified toggle for voice email recording (dispatches to correct step) */
  const toggleRecording = async () => {
    if (isRecordingEmail) {
      // Which field are we recording into?
      if (recordingField === 'name') await finishVoiceName();
      else if (recordingField === 'password') await finishVoicePassword();
      else if (emailStep === 1) await finishVoiceEmailStep1();
      else if (emailStep === 2) await finishVoiceEmailStep2();
      else {
        // Legacy single-step fallback (keyboard mode recording)
        setIsRecordingEmail(false);
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
          setIsRecordingEmail(false);
        }
      }
    } else {
      // Start recording based on mode
      if (inputMode === 'audio') {
        await startVoiceEmailStep1();
      } else {
        try {
          if (!isSpeechSupported()) { setError('Microphone not supported.'); return; }
          setIsRecordingEmail(true);
          await startRecording();
          speak('Listening... speak your email now.');
        } catch { setIsRecordingEmail(false); }
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
      <h1 style={styles.title} role="heading" aria-level={1}>
        <span style={styles.titleIcon}>{'\u{1F441}\uFE0F'}</span>
        Create Account
      </h1>
      <p style={styles.subtitle}>Join EyeDentify today</p>

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
            <p style={{ color: '#7C4DFF', margin: '10px 0', fontSize: 13, lineHeight: 1.5 }}>
              In real implementation, braille user can connect real braille input keyboard to type
            </p>
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
                onFocus={() => speak('Full name input. Type your full name or use the Speak Name button below.')}
              />
              {/* Name voice input button — audio mode only */}
              {inputMode === 'audio' && (
                <div style={styles.fieldVoiceRow}>
                  <button type="button" onClick={toggleVoiceName}
                    style={{ ...styles.fieldMicBtn, ...(isRecordingName?styles.fieldMicActive:{}), opacity: loading?0.5:1 }}
                    disabled={loading || (!isRecordingName && (isRecordingEmail || isRecordingPassword))}
                    aria-label={isRecordingName ? "Stop name recording" : "Speak your name"}
                    onFocus={() => speak(isRecordingName ? 'Stop Name button. Tap to stop recording.' : 'Speak Name button. Press Enter to start recording your name.')}
                  >
                    {isRecordingName ? '🔴 Stop' : '🎤 Speak Name'}
                  </button>
                  {isRecordingName && <p style={styles.recordingHint}>Say your full name now...</p>}
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
                onFocus={() => speak('Email input. Type your email address.')}
              />

              {/* Voice Input — Two-step for audio mode (RIGHT BELOW EMAIL INPUT) */}
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
                      ...(isRecordingEmail ? styles.voiceBtnActive : {}),
                      opacity: loading ? 0.5 : 1,
                      cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                    disabled={loading}
                    aria-label={isRecordingEmail
                      ? `Stop recording step ${emailStep}`
                      : "Start two-step voice email entry"
                    }
                    aria-pressed={isRecordingEmail}
                    tabIndex={0}
                    onFocus={() => speak(isRecordingEmail ? `Recording in progress, step ${emailStep}. Press Enter to stop.` : 'Speak Email button. Press Enter to start two-step voice email entry.')}
                  >
                    {isRecordingEmail
                      ? (emailStep === 1 ? <>🔴 Stop — Listening for username...</>
                        : emailStep === 2 ? <>🔴 Stop — Listening for domain...</>
                        : <>🔴 Stop & Transcribe</>)
                      : (emailStep === 3 ? <>✓ Re-record Email</>
                        : <>🎤 Speak Email (2 Steps)</>)
                    }
                  </button>
                  {isRecordingEmail && emailStep === 1 && (
                    <p style={styles.recordingHint}>Say your username now (e.g., "alice123")...</p>
                  )}
                  {isRecordingEmail && emailStep === 2 && (
                    <p style={styles.recordingHint}>Say your provider now (e.g., "gmail dot com")...</p>
                  )}
                </div>
              )}

              {/* Password field with eye icon + mic button */}
              <div style={{ position: 'relative', width: '100%' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  style={styles.textInput}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  placeholder="Password (min 6 characters)"
                  autoComplete="new-password"
                  aria-label="Password, minimum 6 characters"
                  tabIndex={0}
                  onFocus={() => speak('Password input. Type your password, minimum 6 characters.')}
                />
              </div>

              {/* Password action row: eye icon + speak password */}
              <div style={styles.passwordActionRow}>
                {/* Eye icon to show/hide transcribed password */}
                {password && (
                  <button type="button" onClick={() => {
                    setShowPassword(!showPassword);
                    speak(showPassword ? 'Password hidden.' : `Password revealed: ${password}. ${password.length} characters.`);
                  }}
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
                    style={{ ...styles.fieldMicBtn, ...(isRecordingPassword?styles.fieldMicActive:{}), opacity: loading?0.5:1 }}
                    disabled={loading || (isRecordingName || isRecordingEmail || isRecordingPassword) && !isRecordingPassword}
                    aria-label={isRecordingPassword ? "Stop password recording" : "Speak your password"}
                    tabIndex={0}
                    onFocus={() => speak(isRecordingPassword ? 'Stop Password button. Tap to stop recording.' : 'Speak Password button. Tap to start recording your password.')}
                  >
                    {isRecordingPassword ? '🔴 Stop Password' : '🎤 Speak Password'}
                  </button>
                )}
                {isRecordingPassword && <p style={styles.recordingHint}>Say each character of your password...</p>}
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
    fontSize: 32,
    fontWeight: 800,
    color: '#222',
    marginBottom: 6,
    letterSpacing: -0.5,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  titleIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #F5A623, #FF8C00)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 19,
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    marginBottom: 28,
    textAlign: 'center',
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
  dismissBtn: { background: 'none', border: 'none', color: '#D94A4A', fontSize: 18, cursor: 'pointer', padding: '2px 6px' },
  modePicker: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
  },
  instruction: { color: '#555', fontSize: 17, fontWeight: 600, marginBottom: 24, textAlign: 'center' },
  modeButton: {
    width: '100%', height: 54, borderRadius: 14,
    marginBottom: 11, cursor: 'pointer', fontSize: 15, fontWeight: 700,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", transition: 'all 0.15s',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderStyle: 'solid', borderColor: '#EEE',
    backgroundColor: '#FFFFFF', color: '#444',
  },
  audioButton: { borderColor: '#4CAF50', background: '#F8FFF8', color: '#2E7D32' },
  brailleButton: { borderColor: '#7C4DFF', background: '#F8F5FF', color: '#5C3FD4' },
  keyboardButton: { borderColor: '#F5A623', background: '#FFF8EE', color: '#B07800' },
  hint: { color: '#AAA', fontSize: 13, textAlign: 'center', marginTop: 18 },
  loginLink: {
    background: 'none', color: '#F5A623', border: 'none', cursor: 'pointer',
    marginTop: 18, fontSize: 14, textDecoration: 'none', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontWeight: 600, padding: '8px 0',
  },
  inputArea: {
    width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', alignItems: 'center',
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: '28px 24px',
    border: '1px solid #EEE', boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
  },
  label: { color: '#222', fontSize: 17, marginBottom: 14, fontWeight: 700, alignSelf: 'flex-start' },
  modeIndicator: { color: '#F5A623', fontSize: 13, marginBottom: 16, fontWeight: 700, alignSelf: 'flex-start', textTransform: 'uppercase', letterSpacing: 0.5 },
  textInput: {
    width: '100%', height: 48, backgroundColor: '#F5F5F5', borderRadius: 12,
    padding: '14px 16px', color: '#222', fontSize: 15,
    border: '1.5px solid #EEE', marginBottom: 12, boxSizing: 'border-box',
    outline: 'none', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", transition: 'border-color 0.2s',
  },
  voiceArea: { width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, margin: '6px 0' },
  voiceBtn: {
    width: '100%', height: 48, borderRadius: 12,
    borderWidth: 1.5, borderStyle: 'solid', borderColor: '#4CAF50',
    background: '#F8FFF8', color: '#2E7D32', cursor: 'pointer',
    fontSize: 14, fontWeight: '600', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", transition: 'all 0.15s',
    display: 'flex', justifyContent: 'center', alignItems: 'center',
  },
  voiceBtnActive: { background: '#FFF0EE', borderColor: '#D94A4A', color: '#D94A4A' },
  recordingHint: { color: '#2E7D32', fontSize: 12, fontStyle: 'italic' },
  emailPreview: { color: '#888', fontSize: 13, marginBottom: 16, textAlign: 'center' },
  // Per-field mic buttons (name, password)
  fieldVoiceRow: {
    width: '100%', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 6, marginBottom: 10,
  },
  fieldMicBtn: {
    width: '100%', height: 36, borderRadius: 10,
    border: '1.5px solid #FF9800',
    background: '#FFF8EE', color: '#B07800',
    cursor: 'pointer', fontSize: 13, fontWeight: '600', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    transition: 'all 0.15s',
  },
  fieldMicActive: {
    background: '#FFF0EE', borderColor: '#D94A4A', color: '#D94A4A',
  },
  buttonRow: { display: 'flex', justifyContent: 'space-between', width: '100%', gap: 12, marginBottom: 12 },
  actionButton: {
    flex: 1, height: 48, borderRadius: 12, cursor: 'pointer',
    fontSize: 15, fontWeight: '700', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: 'flex', justifyContent: 'center', alignItems: 'center',
  },
  backButton: { background: '#F5F5F5', borderWidth: 1.5, borderStyle: 'solid', borderColor: '#E0E0E0', color: '#666' },
  submitButton: { background: 'linear-gradient(135deg, #F5A623, #FF8C00)', borderWidth: 1.5, borderStyle: 'solid', borderColor: '#F5A623', color: '#FFF', boxShadow: '0 3px 12px rgba(245,166,35,0.3)' },
  disabledButton: { opacity: 0.35, cursor: 'not-allowed' },
  // Two-step voice email styles
  stepHint: { color: '#888', fontSize: 13, textAlign: 'center', margin: '4px 0', lineHeight: 1.4 },
  stepIndicator: { color: '#F5A623', fontSize: 13, fontWeight: 'bold', textAlign: 'center', margin: '6px 0' },
  stepComplete: { color: '#4CAF50', fontSize: 13, textAlign: 'center', margin: '6px 0' },
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
    fontWeight: '600',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    transition: 'all 0.15s',
  },
};
