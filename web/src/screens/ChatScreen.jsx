import React, { useState, useRef, useEffect, useCallback } from 'react';
import { isSpeechSupported, startRecording, stopRecording } from '../utils/whisper';
import { sendChatMessage, processImage, getChatHistory } from '../services/apiService';

const ChatScreen = ({ user, onLogout }) => {
  // Capture userId once — never changes during session, avoids "unknown" fallback
  const currentUserId = useRef(user?.id || user?.user_id || null);
  useEffect(() => {
    if (user?.id || user?.user_id) {
      currentUserId.current = user.id || user.user_id;
    }
  }, [user]);

  const uid = () => currentUserId.current;

  /** Get userId or throw with descriptive error */
  const requireUid = () => {
    const id = currentUserId.current;
    if (!id) throw new Error('Not logged in — no valid user session found');
    return id;
  };
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [capturedImage, setCapturedImage] = useState(null);
  const [showBrailleInput, setShowBrailleInput] = useState(false);
  const [processingAction, setProcessingAction] = useState(null);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [brailleCells, setBrailleCells] = useState(['','','','','','']);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Voice instruction on mount
  useEffect(() => {
    speak('Chat screen loaded. Use Tab to navigate: message input, braille button, microphone, send button. Press Enter to send.');
  }, []);

  // Load chat history from backend on mount (persists across refresh/re-login)
  useEffect(() => {
    const loadHistory = async () => {
      if (!user) return;
      const userId = uid();
      if (!userId) return;
      
      try {
        console.log('[Chat] Loading chat history for user:', userId);
        const history = await getChatHistory(userId);
        console.log('[Chat] Loaded', history.length, 'history messages');
        
        if (history.length > 0) {
          // Convert backend format to frontend message format
          const restored = history.map(msg => ({
            role: msg.role,  // 'user' or 'assistant'
            text: msg.content,
            timestamp: new Date(msg.created_at).getTime() || Date.now(),
            memoryId: msg.memory_id || null,
            imageUri: msg.image_uri || null,  // image URL from memory enrichment
          }));
          setMessages(restored);
          console.log('[Chat] History restored:', restored.length, 'messages');
        }
      } catch (err) {
        console.error('[Chat] Failed to load history:', err);
      }
    };
    
    loadHistory();
  }, [user]);

  const startCamera = async () => {
    try {
      setCameraError(null);
      setIsCameraOpen(true);
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
    } catch (err) {
      console.error('Camera error:', err);
      setCameraError('Cannot access camera. Please grant permission.');
      setIsCameraOpen(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const switchCamera = () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    if (isCameraOpen) stopCamera().then(() => setTimeout(startCamera, 200));
  };

  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(dataUrl);
    stopCamera();
  };

  const sendMessage = useCallback(async (textOverride = null, imageBase64 = null) => {
    const text = textOverride || inputText.trim();
    if (!text && !imageBase64) return;

    const userMsg = { role: 'user', text, image: imageBase64, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setShowBrailleInput(false);
    setIsLoading(true);

    try {
      const userId = requireUid();
      console.log('[Chat] Sending message to backend:', text ? text.substring(0, 50) : '(no text)', imageBase64 ? '(with image)' : '');
      const response = await sendChatMessage(userId, text, imageBase64);
      console.log('[Chat] Backend response:', JSON.stringify(response).substring(0, 200));

      let botText = '';
      let botImage = null;
      let botAudioUrl = null;

      if (response.ai_response) botText = response.ai_response;
      else if (response.response) botText = response.response;
      else if (typeof response === 'string') botText = response;
      else botText = JSON.stringify(response);

      if (response.image_description && !botText.includes(response.image_description)) {
        botText += '\n\n' + response.image_description;
      }

      if (response.processedImage) botImage = response.processedImage;
      if (response.audio_url) botAudioUrl = response.audio_url;

      const botMsg = { role: 'assistant', text: botText, image: botImage, audioUrl: botAudioUrl, timestamp: Date.now() };
      setMessages(prev => [...prev, botMsg]);
      
      // Speak the AI reply aloud for accessibility
      if (botText && !botText.startsWith('Error:')) {
        speak(botText);
      }
    } catch (error) {
      console.error('Send error:', error);
      const errMsg = { role: 'assistant', text: `Error: ${error.message}. Is the backend running?`, isError: true, timestamp: Date.now() };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, user]);

  const handleCaptureAndSend = async () => {
    if (!capturedImage) return;
    setProcessingAction('analyzing...');
    
    // Add user image message to chat
    const userMsg = { role: 'user', text: '(Image captured)', image: capturedImage, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      console.log('[Vision] Sending image to /vision/process endpoint...');
      const response = await processImage(requireUid(), capturedImage);
      console.log('[Vision] Response:', JSON.stringify(response).substring(0, 300));

      const description = response.description || response.image_description || 'Image processed.';
      const memoryId = response.memory_id || null;
      const imageUrl = response.image_url || null;

      // Add AI description as assistant message (text only — no image echo)
      const botMsg = { 
        role: 'assistant', 
        text: description,
        imageUrl: imageUrl,
        memoryId: memoryId,
        timestamp: Date.now() 
      };
      setMessages(prev => [...prev, botMsg]);

      // Speak the AI description aloud
      if (description) {
        speak(description);
      }
    } catch (error) {
      console.error('Vision error:', error);
      const errMsg = { role: 'assistant', text: `Error: ${error.message}. Is the backend running?`, isError: true, timestamp: Date.now() };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
      setProcessingAction(null);
      setCapturedImage(null);
    }
  };

  /** Whisper voice recording for chat messages */
  const toggleVoiceMessage = async () => {
    if (isVoiceRecording) {
      try {
        setIsVoiceRecording(false);
        console.log('[Chat] Stopping voice recording, sending to whisper...');
        const text = await stopRecording(requireUid());
        console.log('[Chat] Whisper result:', JSON.stringify(text));
        if (text && text.trim()) {
          setInputText(text.trim());
          console.log('[Chat] Voice transcribed, auto-sending:', text.trim().substring(0, 80));
          sendMessage(text.trim());
        } else {
          console.warn('[Chat] Whisper returned empty text');
        }
      } catch (err) {
        console.error('[Chat] Voice error:', err);
        speak('Sorry, I could not understand your voice. Please try again.');
        setIsVoiceRecording(false);
      }
    } else {
      try {
        if (!isSpeechSupported()) return;
        setIsVoiceRecording(true);
        await startRecording();
      } catch {
        setIsVoiceRecording(false);
      }
    }
  };

  const handleKeyPress = (e) => { if (e.key === 'Enter') sendMessage(); };

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const styles = {
    screen: { display: 'flex', height: '100vh', fontFamily: "'Inter',-apple-system,sans-serif", backgroundColor: '#0A0A0F', color: '#EEE', overflow: 'hidden' },
    sidebar: { width: 340, backgroundColor: '#111118', borderRight: '1px solid #222', display: 'flex', flexDirection: 'column', flexShrink: 0 },
    header: { padding: '20px 22px', borderBottom: '1px solid #222', display: 'flex', alignItems: 'center', gap: 12 },
    avatar: { width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg,#6C63FF,#9D94FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 'bold', color: '#FFF', flexShrink: 0 },
    userInfo: { flex: 1, minWidth: 0 },
    userName: { fontSize: 15, fontWeight: 700, color: '#FFF', margin: 0 },
    userEmail: { fontSize: 12, color: '#888', marginTop: 2 },
    logoutBtn: { background: 'rgba(255,80,80,0.12)', color: '#FF6B6B', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' },
    cameraSection: { padding: 18, borderBottom: '1px solid #222' },
    sectionTitle: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, color: '#6C63FF', marginBottom: 14 },
    previewArea: { position: 'relative', backgroundColor: '#000', borderRadius: 16, border: '1px solid #333' },
    videoElement: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
    capturedPreview: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
    cameraPlaceholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 10, color: '#555' },
    cameraIcon: { width: 48, height: 48, borderRadius: '50%', background: '#1A1A24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 },
    cameraRow: { display: 'flex', gap: 10, marginTop: 14 },
    btnPrimary: { flex: 1, background: '#6C63FF', color: '#FFF', border: 'none', borderRadius: 12, padding: '12px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
    btnSecondary: { flex: 1, background: '#1E1E28', color: '#CCC', border: '1px solid #333', borderRadius: 12, padding: '12px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
    btnDanger: { flex: 1, background: 'rgba(255,80,80,0.15)', color: '#FF6B6B', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 12, padding: '12px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
    capturedActions: { marginTop: 14, display: 'flex', gap: 10 },
    sendCapturedBtn: { flex: 2, background: '#6C63FF', color: '#FFF', border: 'none', borderRadius: 12, padding: '12px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
    retakeBtn: { flex: 1, background: '#1E1E28', color: '#CCC', border: '1px solid #333', borderRadius: 12, padding: '12px', cursor: 'pointer', fontWeight: 600, fontSize: 14 },
    mainContent: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
    chatHeader: { padding: '18px 26px', borderBottom: '1px solid #1E1E28', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backdropFilter: 'blur(10px)', backgroundColor: 'rgba(10,10,15,0.85)' },
    chatTitle: { fontSize: 17, fontWeight: 700, margin: 0 },
    statusDot: { display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: '#4ADE80', marginRight: 7 },
    msgCount: { fontSize: 13, color: '#666' },
    chatArea: { flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16, scrollBehavior: 'smooth' },
    welcomeCard: { textAlign: 'center', padding: '50px 30px', color: '#555' },
    welcomeIcon: { fontSize: 52, marginBottom: 20, opacity: 0.5 },
    welcomeTitle: { fontSize: 20, fontWeight: 700, color: '#999', marginBottom: 10 },
    welcomeText: { fontSize: 14, lineHeight: 1.65, color: '#444', maxWidth: 420, margin: '0 auto' },
    messageWrapper: { display: 'flex', gap: 10, maxWidth: '78%', animation: 'fadeIn 0.25s ease' },
    messageWrapperUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
    avatarSmall: { width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#FFF', flexShrink: 0, marginTop: 4 },
    avatarBot: { background: 'linear-gradient(135deg,#6C63FF,#9D94FF)' },
    avatarUser: { background: 'linear-gradient(135deg,#059669,#34D399)' },
    bubble: { padding: '14px 18px', borderRadius: 18, lineHeight: 1.55, fontSize: 14.5, wordBreak: 'break-word' },
    bubbleUser: { background: '#6C63FF', color: '#FFF', borderBottomRightRadius: 5 },
    bubbleBot: { background: '#1E1E28', color: '#DDD', border: '1px solid #2A2A36', borderBottomLeftRadius: 5 },
    bubbleError: { background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.25)', color: '#FF8888' },
    msgImage: { maxWidth: 280, maxHeight: 220, borderRadius: 12, marginTop: 8, display: 'block' },
    audioPlayer: { width: '100%', maxWidth: 260, marginTop: 8, borderRadius: 8 },
    msgTime: { fontSize: 10.5, color: '#555', marginTop: 6, textAlign: 'right' },
    inputArea: { padding: '16px 24px', borderTop: '1px solid #1E1E28', backgroundColor: 'rgba(10,10,15,0.95)' },
    inputContainer: { display: 'flex', gap: 12, alignItems: 'flex-end' },
    inputBox: { flex: 1, background: '#15151D', border: '1px solid #2A2A36', borderRadius: 16, padding: '14px 18px', color: '#EEE', fontSize: 14.5, outline: 'none', resize: 'none', minHeight: 50, maxHeight: 120, fontFamily: 'inherit', transition: 'border-color 0.2s', boxSizing: 'border-box' },
    inputBoxFocus: { borderColor: '#6C63FF' },
    actionButtons: { display: 'flex', gap: 9, alignItems: 'flex-end' },
    iconBtn: { width: 46, height: 46, borderRadius: 14, border: '1px solid #2A2A36', background: '#1A1A24', color: '#AAA', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, transition: 'all 0.15s' },
    iconBtnHover: { borderColor: '#6C63FF', color: '#6C63FF', background: 'rgba(108,99,255,0.08)' },
    sendButton: { width: 46, height: 46, borderRadius: 14, border: 'none', background: '#6C63FF', color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, transition: 'all 0.15s' },
    sendDisabled: { opacity: 0.35, cursor: 'not-allowed' },
    braillePanel: { borderTop: '1px solid #2A2A36', paddingTop: 14, marginTop: 12 },
    processingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 16, zIndex: 10, borderRadius: 16 },
    spinner: { width: 44, height: 44, border: '4px solid #333', borderTopColor: '#6C63FF', borderRadius: '50%', animation: 'spin 0.75s linear infinite' },
    processingText: { color: '#CCC', fontSize: 14, fontWeight: 500 },
    typingIndicator: { display: 'flex', gap: 5, padding: '14px 18px', background: '#1E1E28', borderRadius: 18, borderBottomLeftRadius: 5, alignSelf: 'flex-start', maxWidth: 120 },
    dot: { width: 8, height: 8, borderRadius: '50%,', background: '#6C63FF', animation: 'bounce 1.2s infinite' },
    errorBanner: { background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.3)', color: '#FF8888', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginTop: 10, textAlign: 'center' },
    captureButton: { background: '#6C63FF', color: '#FFF', border: 'none', padding: '14px 28px', borderRadius: 25, cursor: 'pointer', fontSize: 17, fontWeight: 'bold', fontFamily: 'inherit' },
    captureButtonDisabled: { opacity: 0.5, cursor: 'not-allowed' },
    backButton: { background: 'rgba(255,255,255,0.1)', color: '#CCC', border: '1px solid #666', padding: '13px 22px', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: '600', fontFamily: 'inherit' },
  };

  const BrailleInputComponent = showBrailleInput ? (() => {
    const CELL_MAP = {
      'a':1,'b':3,'c':9,'d':25,'e':27,'f':11,'g':19,'h':21,'i':5,'j':23,
      'k':33,'l':35,'m':41,'n':43,'o':45,'p':37,'q':39,'r':29,'s':31,'t':47,
      'u':53,'v':55,'w':61,'x':57,'y':59,'z':63,
      '1':1,'2':3,'3':9,'4':25,'5':27,'6':11,'7':19,'8':21,'9':5,'0':23,
    };
    const toggle = (idx) => {
      const next = [...brailleCells]; next[idx] = brailleCells[idx] ? '' : '●'; setBrailleCells(next);
    };
    const val = parseInt(brailleCells.map(c=>c?'1':'0').join('').padEnd(6,'0'),2);
    const char = Object.entries(CELL_MAP).find(([,v])=>v===val)?.[0]||'';
    const addChar = () => { if(char){setInputText(p=>p+char);setBrailleCells(['','','','','','']);} };
    const delChar = () => { setInputText(p=>p.slice(0,-1)); };
    const addSpace = () => { setInputText(p=>p+' '); };
    return (
      <div style={styles.braillePanel}>
        <div style={{display:'flex',alignItems:'center',gap:16}}>
          {[0,1,2].map(i=>(
            <div key={i} style={{display:'flex',flexDirection:'column',gap:6}}>
              {[brailleCells[i],brailleCells[i+3]].map((filled,j)=>(
                <button key={j} onClick={()=>toggle(i+(j===3?3:j))} style={{width:38,height:38,borderRadius:'50%',border:filled?'none':'2px solid #555',background:filled?'#6C63FF':'#1E1E28',color:'#FFF',cursor:'pointer',fontSize:16}} tabIndex={0} onFocus={() => speak(filled ? 'Braille dot filled. Tap to unfill.' : 'Braille dot empty. Tap to fill.')}>{filled||''}</button>
              ))}
            </div>
          ))}
          <div style={{flex:1,textAlign:'center'}}>
            <div style={{fontSize:32,fontWeight:700,color:'#6C63FF',minHeight:40}}>{char||'_'}</div>
            <div style={{fontSize:12,color:'#666',marginTop:4}}>Braille Character</div>
          </div>
        </div>
        <div style={{display:'flex',gap:10,marginTop:14,justifyContent:'center'}}>
          <button onClick={addChar} style={styles.btnPrimary} tabIndex={0} onFocus={() => speak(char ? `Add button. Adds the character ${char} to your message.` : 'Add button. No character formed yet.')}>Add</button>
          <button onClick={addSpace} style={styles.btnSecondary} title="Space" tabIndex={0} onFocus={() => speak('Space button. Add a space to your message.')}>Space</button>
          <button onClick={delChar} style={styles.btnDanger} title="Delete" tabIndex={0} onFocus={() => speak('Delete button. Remove the last character from your message.')}>Del</button>
          <button onClick={()=>{setShowBrailleInput(false);setBrailleCells(['','','','','','']);}} style={styles.btnSecondary} tabIndex={0} onFocus={() => speak('Close braille keyboard button. Tap to close braille input.')}>Close</button>
        </div>
      </div>
    );
  })() : null;

  return (
    <div style={styles.screen} role="main" aria-label="EyeDentify Chat Interface">
      {/* Sidebar */}
      <div style={styles.sidebar} role="complementary" aria-label="Sidebar panel">
        <div style={styles.header}>
          <div style={styles.avatar} role="img" aria-label={`User avatar ${(user.name||user.email||'U')[0]}`}>{(user.name||user.email||'U')[0].toUpperCase()}</div>
          <div style={styles.userInfo}>
            <div style={styles.userName} aria-live="polite">{user.name||user.email||'User'}</div>
            <div style={styles.userEmail} aria-hidden="true">{user.email||''}</div>
          </div>
          <button onClick={onLogout} style={styles.logoutBtn} aria-label="Logout from account" tabIndex={0} onFocus={() => speak('Logout button. Tap to log out of your account.')}>Logout</button>
        </div>

        <div style={styles.cameraSection}>
          <div style={styles.sectionTitle} id="camera-heading">Vision Camera</div>

          <div style={styles.previewArea} role="region" aria-labelledby="camera-heading">
            {cameraError && <div style={styles.errorBanner} role="alert" aria-live="assertive">{cameraError}</div>}

            {isCameraOpen ? (
              <>
                <video ref={videoRef} autoPlay playsInline muted style={styles.videoElement} aria-label="Camera preview - live feed" />
                <div style={styles.cameraRow}>
                  <button onClick={stopCamera} style={styles.btnSecondary} aria-label="Close camera" tabIndex={0} onFocus={() => speak('Close camera button. Tap to turn off camera.')}>Close</button>
                  <button onClick={switchCamera} style={styles.btnSecondary} aria-label="Switch camera between front and back" tabIndex={0} onFocus={() => speak('Flip camera button. Switch between front and back camera.')}>Flip</button>
                  <button onClick={captureImage} style={styles.btnPrimary} aria-label="Capture photo from camera" tabIndex={0} onFocus={() => speak('Capture button. Take a photo now.')}>Capture</button>
                </div>
              </>
            ) : capturedImage ? (
              <>
                <img src={capturedImage} alt="Captured image preview" style={styles.capturedPreview} />
                {processingAction && (
                  <div style={styles.processingOverlay} role="status" aria-live="polite" aria-busy="true">
                    <div style={styles.spinner}></div>
                    <div style={styles.processingText}>{processingAction}</div>
                  </div>
                )}
                <div style={styles.capturedActions}>
                  <button onClick={handleCaptureAndSend} style={styles.sendCapturedBtn} disabled={!!processingAction} aria-label="Analyze captured image and send to AI" tabIndex={0} onFocus={() => speak('Analyze and Send button. Send photo to AI for description.')}>Analyze & Send</button>
                  <button onClick={() => setCapturedImage(null)} style={styles.retakeBtn} aria-label="Retake photo" tabIndex={0} onFocus={() => speak('Retake button. Discard and take a new photo.')}>Retake</button>
                </div>
              </>
            ) : (
              <>
                <div style={styles.cameraPlaceholder}>
                  <div style={styles.cameraIcon}>📷</div>
                  <div style={{fontSize:13,color:'#555'}}>Camera Off</div>
                </div>
                <div style={styles.cameraRow}>
                  <button onClick={startCamera} style={styles.btnPrimary} aria-label="Open camera for vision capture" tabIndex={0} onFocus={() => speak('Open Camera button. Tap to start camera for vision capture.')}>Open Camera</button>
                </div>
              </>
            )}

            <canvas ref={canvasRef} style={{display:'none'}} />
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div style={styles.mainContent}>
        <div style={styles.chatHeader}>
          <div><span style={styles.statusDot}></span><strong>EyeDentify AI Assistant</strong></div>
          <div style={styles.msgCount} aria-live="polite" aria-atomic="true">{messages.length} messages</div>
        </div>

        <div style={styles.chatArea} role="log" aria-label="Chat messages" aria-live="polite">
          {messages.length === 0 && !isLoading ? (
            <div style={{...styles.welcomeCard, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center'}} role="status">
              <div style={styles.welcomeIcon}>👁️</div>
              <div style={styles.welcomeTitle}>Welcome to EyeDentify</div>
              <div style={styles.welcomeText}>
                I am your AI vision assistant. I can help you identify objects, read text,
                describe scenes, and answer questions about what you show me.
                <br /><br />Take a photo with the camera or type a message to get started!
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} style={{...styles.messageWrapper, ...(msg.role==='user'?styles.messageWrapperUser:{})}} role="article" aria-label={`${msg.role==='user'?'You':'AI'} message`}>
                <div style={{...styles.avatarSmall,...(msg.role==='user'?styles.avatarUser:styles.avatarBot)}} aria-hidden="true">{msg.role==='user'?'U':'AI'}</div>
                <div>
                  <div style={{...styles.bubble,...(msg.role==='user'?styles.bubbleUser:(msg.isError?styles.bubbleError:styles.bubbleBot))}}>
                    <span>{msg.text}</span>
                    {msg.image && <img src={msg.image} alt="Captured image" style={styles.msgImage} />}
                    {msg.imageUri && !msg.image && <img src={msg.imageUri} alt="Stored captured image" style={styles.msgImage} />}
                    {msg.audioUrl && <audio src={msg.audioUrl} controls style={styles.audioPlayer} aria-label="Audio response from AI" />}
                  </div>
                  <div style={styles.msgTime} aria-hidden="true">{formatTime(msg.timestamp)}</div>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div style={styles.typingIndicator} role="status" aria-label="AI is typing">
              <div style={{...styles.dot,animationDelay:'0s'}}></div>
              <div style={{...styles.dot,animationDelay:'0.2s'}}></div>
              <div style={{...styles.dot,animationDelay:'0.4s'}}></div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div style={styles.inputArea} role="form" aria-label="Message input area">
          <div style={styles.inputContainer}>
            <textarea
              value={inputText}
              onChange={e=>setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message or use the camera..."
              style={{...styles.inputBox,...(document.activeElement&&document.activeElement.value!==undefined?styles.inputBoxFocus:{})}}
              rows={1}
              disabled={isLoading}
              aria-label="Type your message here. Press Enter to send."
              tabIndex={0}
              onFocus={() => speak('Message input field. Type your question and press Enter to send.')}
            />
            <div style={styles.actionButtons}>
              <button
                onClick={() => setShowBrailleInput(!showBrailleInput)}
                title="Braille Input"
                style={{...styles.iconBtn,...(showBrailleInput?{background:'rgba(108,99,255,0.15)',color:'#6C63FF',borderColor:'#6C63FF'}:{})}}
                aria-label="Toggle braille input keyboard"
                aria-pressed={showBrailleInput}
                tabIndex={0}
                onFocus={() => speak('Braille input button. Tap to open or close the Braille dot keyboard.')}
              >⣿</button>
              <button
                onClick={toggleVoiceMessage}
                title="Voice Message (Whisper)"
                disabled={isLoading}
                style={{
                  ...styles.iconBtn,
                  ...(isVoiceRecording ? { background: 'rgba(255,60,60,0.15)', color: '#FF4444', borderColor: '#FF4444' } : { background: 'rgba(76,175,80,0.08)', color: '#4CAF50', borderColor: '#4CAF50' }),
                  opacity: isLoading ? 0.4 : 1,
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                }}
                aria-label={isVoiceRecording ? "Stop voice recording" : "Start voice recording with microphone"}
                aria-pressed={isVoiceRecording}
                tabIndex={0}
                onFocus={() => speak(isVoiceRecording ? 'Stop recording button. Tap to stop voice recording and send.' : 'Voice record button. Press and hold to record a voice message.')}
              >{isVoiceRecording ? '🔴' : '🎤'}</button>
              <button
                onClick={sendMessage}
                disabled={isLoading || (!inputText.trim())}
                style={{...styles.sendButton,...((!inputText.trim()||isLoading)?styles.sendDisabled:{})}}
                aria-label={!inputText.trim() ? "Send button - type a message first" : "Send message"}
                tabIndex={0}
                onFocus={() => speak(!inputText.trim() ? 'Send button is disabled. Type a message first.' : 'Send button. Tap to send your message.')}
              >➤</button>
            </div>
          </div>
          {BrailleInputComponent}
        </div>
      </div>
    </div>
  );
};

function speak(text) {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    speechSynthesis.speak(u);
  }
}

export default ChatScreen;
