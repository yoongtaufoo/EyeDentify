import { useState, useRef, useEffect, useCallback } from 'react';
import { isSpeechSupported, startRecording, stopRecording } from '../utils/whisper';
import { sendChatMessageWithAudio, processImage, getChatHistory, getTTSAudio } from '../services/apiService';

const ChatScreen = ({ user, onLogout }) => {
  // Capture userId once
  const currentUserId = useRef(user?.id || user?.user_id || null);
  useEffect(() => {
    if (user?.id || user?.user_id) {
      currentUserId.current = user.id || user.user_id;
    }
  }, [user]);

  const uid = () => currentUserId.current;

  const requireUid = () => {
    const id = currentUserId.current;
    if (!id) throw new Error('Not logged in — no valid user session found');
    return id;
  };

  // const playBackendTTS = useCallback((audioBase64) => {
  //   if (!audioBase64) return false;
  //   try {
  //     const binaryStr = atob(audioBase64);
  //     const bytes = new Uint8Array(binaryStr.length);
  //     for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  //     const blob = new Blob([bytes], { type: 'audio/mp3' });
  //     const url = URL.createObjectURL(blob);
  //     const audio = new Audio(url);
  //     audio.volume = 1.0;
  //     audio.play().catch(e => console.warn('[TTS] Autoplay blocked:', e.message));
  //     audio.onended = () => URL.revokeObjectURL(url);
  //     return true;
  //   } catch (err) {
  //     console.warn('[TTS] Playback failed:', err.message);
  //     return false;
  //   }
  // }, []);

  const playBackendTTS = useCallback((audioBase64) => {
    if (!audioBase64) return false;
    try {
      // Kill any backend audio currently speaking
      if (activeBackendAudioRef.current) {
        activeBackendAudioRef.current.pause();
        activeBackendAudioRef.current = null;
      }

      const binaryStr = atob(audioBase64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'audio/mp3' });
      const url = URL.createObjectURL(blob);
      
      const audio = new Audio(url);
      audio.volume = 1.0;
      
      // Track this instance globally
      activeBackendAudioRef.current = audio; 

      audio.play().catch(e => console.warn('[TTS] Autoplay blocked:', e.message));
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (activeBackendAudioRef.current === audio) {
          activeBackendAudioRef.current = null;
        }
      };
      return true;
    } catch (err) {
      console.warn('[TTS] Playback failed:', err.message);
      return false;
    }
  }, []);

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(isLoading);
  
  // Camera states
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [capturedImage, setCapturedImage] = useState(null);
  
  // Input mode states
  const [showBrailleInput, setShowBrailleInput] = useState(false);
  const [processingAction, setProcessingAction] = useState(null);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [brailleCells, setBrailleCells] = useState(['','','','','','']);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const chatEndRef = useRef(null);
  const activeBackendAudioRef = useRef(null);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Voice instruction on mount
  useEffect(() => {
    speak('Chat screen loaded.');
  }, []);

  // Automatically re-attach the camera stream when switching back to live video view
  useEffect(() => {
    if (showCameraModal && !capturedImage && streamRef.current) {
      // A micro-timeout ensures React has fully mounted the <video> element back into the DOM
      const timer = setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = streamRef.current;
          videoRef.current.play().catch(err => console.warn('[Camera] Playback failed:', err));
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [capturedImage, showCameraModal]);

  // Load chat history
  // Polling Sync Engine: Automatically updates history on focus and monitors hardware pipelines every 4s
  useEffect(() => {
    const loadHistory = async () => {
      if (!user) return;
      const userId = uid();
      if (!userId) return;

      // POLLING GUARD: Stop background synchronization if a chat request is processing
      if (isLoadingRef.current || processingAction || isVoiceRecording) return;

      try {
        const history = await getChatHistory(userId);
        if (history && history.length > 0) {
          const restored = history.map(msg => ({
            role: msg.role,
            text: msg.content,
            timestamp: new Date(msg.created_at).getTime() || Date.now(),
            memoryId: msg.memory_id || null,
            imageUri: msg.image_uri || null,
          }));
          
          // Only update state if message counts shift to avoid redundant page flashing
          setMessages(prev => {
            if (prev.length !== restored.length) {
              return restored;
            }
            return prev;
          });
        }
      } catch (err) {
        console.error('[Web Chat Sync] Background sync failed:', err);
      }
    };

    // Run immediately on dashboard load
    loadHistory();

    // Establish persistent background synchronization interval
    const syncInterval = setInterval(loadHistory, 4000);

    return () => clearInterval(syncInterval);
  }, [user]);
  // useEffect(() => {
  //   const loadHistory = async () => {
  //     if (!user) return;
  //     const userId = uid();
  //     if (!userId) return;

  //     try {
  //       console.log('[Chat] Loading history for:', userId);
  //       const history = await getChatHistory(userId);

  //       if (history.length > 0) {
  //         const restored = history.map(msg => ({
  //           role: msg.role,
  //           text: msg.content,
  //           timestamp: new Date(msg.created_at).getTime() || Date.now(),
  //           memoryId: msg.memory_id || null,
  //           imageUri: msg.image_uri || null,
  //         }));
  //         setMessages(restored);
  //       }
  //     } catch (err) {
  //       console.error('[Chat] Failed to load history:', err);
  //     }
  //   };
  //   loadHistory();
  // }, [user]);

  // Camera functions
  const startCamera = async () => {
    try {
      setCameraError(null);
      setShowCameraModal(true);
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
    } catch (err) {
      console.error('Camera error:', err);
      setCameraError('Cannot access camera. Please grant permission.');
      setShowCameraModal(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCameraModal(false);
  };

  const switchCamera = () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    if (showCameraModal) stopCamera().then(() => setTimeout(startCamera, 200));
  };

  // const handleRetakePhoto = () => {
  //   // Reset captured image to show video again
  //   setCapturedImage(null);
  //   // Ensure stream is connected and video plays
  //   if (videoRef.current && streamRef.current) {
  //     videoRef.current.srcObject = streamRef.current;
  //     // Explicitly play the video after a small delay
  //     setTimeout(() => {
  //       videoRef.current?.play?.().catch(err => console.warn('Play error:', err));
  //     }, 100);
  //   }
  // };

  const handleRetakePhoto = () => {
    // Simply clear the captured image state.
    // The new useEffect hook below will handle re-attaching the live video stream dynamically.
    setCapturedImage(null);
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
    // DO NOT close camera modal here - keep it open to show captured preview
  };

  // Send message
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
      const response = await sendChatMessageWithAudio(userId, text);

      let botText = '';
      let botImage = null;
      let botAudioB64 = null;

      if (response.ai_response) botText = response.ai_response;
      else if (response.response) botText = response.response;
      else if (typeof response === 'string') botText = response;
      else botText = JSON.stringify(response);

      if (response.image_description && !botText.includes(response.image_description)) {
        botText += '\n\n' + response.image_description;
      }

      if (response.processedImage) botImage = response.processedImage;
      if (response.audio_base64) botAudioB64 = response.audio_base64;

      const botMsg = { role: 'assistant', text: botText, image: botImage, audioBase64: botAudioB64, timestamp: Date.now() };
      setMessages(prev => [...prev, botMsg]);

      if (botText && !botText.startsWith('Error:')) {
        if (!playBackendTTS(botAudioB64)) {
          speak(botText);
        }
      }
    } catch (error) {
      console.error('Send error:', error);
      const errMsg = { role: 'assistant', text: `Error: ${error.message}. Is the backend running?`, isError: true, timestamp: Date.now() };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [inputText, user, playBackendTTS]);

  // Capture and send image
  const handleCaptureAndSend = async () => {
    if (!capturedImage) return;
    setProcessingAction('analyzing...');

    const userMsg = { role: 'user', text: '(Image captured)', image: capturedImage, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    try {
      const response = await processImage(requireUid(), capturedImage);
      const description = response.description || response.image_description || 'Image processed.';
      const memoryId = response.memory_id || null;
      const imageUrl = response.image_url || null;

      const botMsg = {
        role: 'assistant',
        text: description,
        imageUrl: imageUrl,
        memoryId: memoryId,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, botMsg]);

      if (description) {
        try {
          const ttsResp = await getTTSAudio(description);
          if (!playBackendTTS(ttsResp.audio_base64)) {
            speak(description);
          }
        } catch {
          speak(description);
        }
      }
    } catch (error) {
      console.error('Vision error:', error);
      const errMsg = { role: 'assistant', text: `Error: ${error.message}. Is the backend running?`, isError: true, timestamp: Date.now() };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
      setProcessingAction(null);
      setCapturedImage(null);
      setShowCameraModal(false);  // Close modal after processing completes
    }
  };

  // // Voice recording
  // const toggleVoiceMessage = async () => {
  //   if (isVoiceRecording) {
  //     try {
  //       setIsVoiceRecording(false);
  //       const text = await stopRecording(requireUid());
  //       if (text && text.trim()) {
  //         setInputText(text.trim());
  //         sendMessage(text.trim());
  //       }
  //     } catch (err) {
  //       console.error('[Chat] Voice error:', err);
  //       speak('Sorry, I could not understand your voice.');
  //       setIsVoiceRecording(false);
  //     }
  //   } else {
  //     try {
  //       if (!isSpeechSupported()) return;
  //       setIsVoiceRecording(true);
  //       await startRecording();
  //     } catch {
  //       setIsVoiceRecording(false);
  //     }
  //   }
  // };

  // Voice recording
  // const toggleVoiceMessage = async () => {
  //   // 1. Stop local speech synthesis engine
  //   if ('speechSynthesis' in window) {
  //     window.speechSynthesis.cancel();
  //   }

  //   // 2. Stop backend high-quality TTS audio stream
  //   if (activeBackendAudioRef.current) {
  //     activeBackendAudioRef.current.pause();
  //     activeBackendAudioRef.current = null;
  //   }

  //   if (isVoiceRecording) {
  //     try {
  //       setIsVoiceRecording(false);
  //       const text = await stopRecording(requireUid());
  //       if (text && text.trim()) {
  //         setInputText(text.trim());
  //         sendMessage(text.trim());
  //       }
  //     } catch (err) {
  //       console.error('[Chat] Voice error:', err);
  //       speak('Sorry, I could not understand your voice.');
  //       setIsVoiceRecording(false);
  //     }
  //   } else {
  //     try {
  //       if (!isSpeechSupported()) return;
  //       setIsVoiceRecording(true);
  //       await startRecording();
  //     } catch {
  //       setIsVoiceRecording(false);
  //     }
  //   }
  // };

  // Voice recording
  const toggleVoiceMessage = async () => {
    // 1. Instantly stop local speech synthesis engine
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    // 2. Instantly stop backend high-quality TTS audio stream
    if (activeBackendAudioRef.current) {
      activeBackendAudioRef.current.pause();
      activeBackendAudioRef.current = null;
    }

    if (isVoiceRecording) {
      try {
        setIsVoiceRecording(false);
        window.isRecordingVoice = false; // Lift the silence guard
        
        const text = await stopRecording(requireUid());
        if (text && text.trim()) {
          setInputText(text.trim());
          sendMessage(text.trim());
        }
      } catch (err) {
        console.error('[Chat] Voice error:', err);
        speak('Sorry, I could not understand your voice.');
        setIsVoiceRecording(false);
        window.isRecordingVoice = false;
      }
    } else {
      try {
        if (!isSpeechSupported()) return;
        
        window.isRecordingVoice = true; // Activate the silence guard before recording starts
        setIsVoiceRecording(true);
        
        // Extra security: clear anything that tried to slip through during the state change
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        
        await startRecording();
      } catch {
        setIsVoiceRecording(false);
        window.isRecordingVoice = false; // Fallback reset
      }
    }
  };

  // const toggleVoiceMessage = async () => {
  //   // Immediately cut off any ongoing screen reading/TTS
  //   if ('speechSynthesis' in window) {
  //     window.speechSynthesis.cancel();
  //   }

  //   if (isVoiceRecording) {
  //     try {
  //       setIsVoiceRecording(false);
  //       const text = await stopRecording(requireUid());
  //       if (text && text.trim()) {
  //         setInputText(text.trim());
  //         sendMessage(text.trim());
  //       }
  //     } catch (err) {
  //       console.error('[Chat] Voice error:', err);
  //       speak('Sorry, I could not understand your voice.');
  //       setIsVoiceRecording(false);
  //     }
  //   } else {
  //     try {
  //       if (!isSpeechSupported()) return;
  //       setIsVoiceRecording(true);
  //       await startRecording();
  //     } catch {
  //       setIsVoiceRecording(false);
  //     }
  //   }
  // };

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  const formatTime = (ts) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMin = Math.floor((now - d) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getDateKey = (ts) => {
    const d = new Date(ts);
    return d.toISOString().split('T')[0]; // YYYY-MM-DD
  };

  const formatDateSeparator = (ts) => {
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

  // ── STYLES (Light theme matching reference images) ──
  const S = {
    screen: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      backgroundColor: '#F7F7F7',
      overflow: 'hidden',
    },

    // Header
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 18px',
      backgroundColor: '#FFFFFF',
      borderBottom: '1px solid #EEE',
      flexShrink: 0,
    },
    logoSection: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    },
    logoIcon: {
      width: 34,
      height: 34,
      borderRadius: 9,
      background: 'linear-gradient(135deg, #F5A623, #FF8C00)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 18,
    },
    logoText: { fontSize: 17, fontWeight: 800, color: '#222' },
    logoSubtext: { fontSize: 10, color: '#F5A623', fontWeight: 700, letterSpacing: 0.6 },
    headerBtn: {
      width: 38, height: 38, borderRadius: 50, border: '1.5px solid #E0E0E0',
      background: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 17, color: '#666',
    },

    // Chat Area
    chatArea: {
      flex: 1, overflowY: 'auto', padding: '16px 16px 8px',
      display: 'flex', flexDirection: 'column', gap: 14, scrollBehavior: 'smooth',
    },

    // Welcome
    welcomeCard: {
      textAlign: 'center', padding: '40px 20px', color: '#AAA',
    },
    welcomeIcon: { fontSize: 44, marginBottom: 14, opacity: 0.45 },
    welcomeTitle: { fontSize: 19, fontWeight: 700, color: '#999', marginBottom: 8 },
    welcomeText: { fontSize: 13.5, lineHeight: 1.6, color: '#BBB', maxWidth: 340, margin: '0 auto' },

    // Message Row
    msgRow: {
      display: 'flex', gap: 8, maxWidth: '85%', animation: 'fadeInUp 0.25s ease',
    },
    msgRowUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },

    // Bubble
    bubble: {
      padding: '12px 16px', borderRadius: 18, lineHeight: 1.55, fontSize: 14,
      wordBreak: 'break-word',
    },
    bubbleUser: {
      backgroundColor: '#F0F0F0', color: '#222', borderBottomRightRadius: 6,
    },
    bubbleBot: {
      backgroundColor: '#FDF3D8', color: '#333', borderBottomLeftRadius: 6,
      border: '1px solid rgba(245,166,35,0.15)',
    },
    bubbleError: {
      backgroundColor: '#FFF0EE', color: '#D94A4A', borderBottomLeftRadius: 6,
      border: '1px solid rgba(217,74,74,0.2)',
    },

    // Message meta
    msgMeta: {
      display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
      justifyContent: 'flex-end',
    },
    msgMetaBot: { justifyContent: 'flex-start' },
    msgSender: { fontSize: 11, fontWeight: 700, color: '#999' },
    msgSenderBot: { color: '#D4940B' },
    msgTime: { fontSize: 10.5, color: '#CCC' },

    // Image in message
    msgImg: { maxWidth: 240, maxHeight: 180, borderRadius: 12, marginTop: 8, display: 'block' },
    
    // Audio player
    audioPlayer: { width: '100%', maxWidth: 220, marginTop: 8, borderRadius: 8 },

    // Typing indicator
    typingIndicator: {
      display: 'flex', gap: 5, padding: '12px 18px', backgroundColor: '#FDF3D8',
      borderRadius: 18, borderBottomLeftRadius: 6, alignSelf: 'flex-start', maxWidth: 100,
      border: '1px solid rgba(245,166,35,0.15)',
    },
    dot: { width: 7, height: 7, borderRadius: '50%', background: '#F5A623', animation: 'bounceTyping 1.2s infinite' },

    // Input Area
    inputArea: {
      padding: '12px 14px', backgroundColor: '#FFF', borderTop: '1px solid #EEE',
      flexShrink: 0,
    },
    inputRow: { display: 'flex', gap: 10, alignItems: 'flex-end' },
    inputBox: {
      flex: 1, background: '#F5F5F5', border: '1.5px solid #EEE', borderRadius: 22,
      padding: '12px 18px', color: '#222', fontSize: 14, outline: 'none', resize: 'none',
      minHeight: 46, maxHeight: 100, fontFamily: 'inherit', lineHeight: 1.4,
      transition: 'border-color 0.2s', boxSizing: 'border-box',
    },
    actionBtns: { display: 'flex', gap: 8, alignItems: 'flex-end' },
    iconBtn: {
      width: 44, height: 44, borderRadius: 50, border: '1.5px solid #E8E8E8',
      background: '#FAFAFA', cursor: 'pointer', display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontSize: 18, color: '#888', transition: 'all 0.15s',
    },
    sendBtn: {
      height: 46,
      paddingLeft: 18,
      paddingRight: 14,
      borderRadius: 14,
      border: 'none',
      background: 'linear-gradient(135deg, #F5A623, #FF8C00)',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 14, fontWeight: 800, color: '#FFF', letterSpacing: -0.3,
      transition: 'all 0.15s', boxShadow: '0 3px 12px rgba(245,166,35,0.3)',
      whiteSpace: 'nowrap',
    },
    sendDisabled: { opacity: 0.35, cursor: 'not-allowed', boxShadow: 'none' },

    // Camera Modal Overlay
    modalOverlay: {
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 200,
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 16,
      padding: 20,
    },
    modalPreview: {
      position: 'relative', width: '100%', maxWidth: 400,
      backgroundColor: '#000', borderRadius: 20, overflow: 'hidden',
    },
    modalVideo: { width: '100%', maxHeight: '50vh', objectFit: 'cover', display: 'block' },
    modalCaptured: { width: '100%', maxHeight: '50vh', objectFit: 'cover', display: 'block', borderRadius: 20 },
    // modalControls: {
    //   position: 'absolute', bottom: 0, left: 0, right: 0,
    //   padding: '20px', background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
    //   display: 'flex', justifyContent: 'center', gap: 14,
    // },
    // captureBtn: {
    //   width: 62, height: 62, borderRadius: 50, border: '3px solid #FFF',
    //   background: 'rgba(255,255,255,0.2)', cursor: 'pointer',
    //   fontSize: 26, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
    // },
    // modalActionBtn: {
    //   width: 48, height: 48, borderRadius: 50, border: '1.5px solid rgba(255,255,255,0.4)',
    //   background: 'rgba(255,255,255,0.1)', cursor: 'pointer', fontSize: 20, color: '#FFF',
    //   display: 'flex', alignItems: 'center', justifyContent: 'center',
    // },
    // Camera Controls Wrapper
    modalControls: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: '24px',
      background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)',
      display: 'flex',
      justifyContent: 'center', 
      alignItems: 'center',
      gap: '32px', // Equal spacing perfectly centers the capture button
      boxSizing: 'border-box',
    },
    
    // Center Shutter Button
    captureBtn: {
      width: 68,
      height: 68,
      borderRadius: '50%',
      border: '4px solid #FFFFFF',
      background: 'rgba(255, 255, 255, 0.3)',
      cursor: 'pointer',
      fontSize: 28,
      color: '#FFF',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'transform 0.1s east, background 0.2s',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    },

    // Balanced Side Action Buttons (Flip & Close)
    modalActionBtn: {
      width: 46,
      height: 46,
      borderRadius: '50%',
      border: '1.5px solid rgba(255,255,255,0.4)',
      background: 'rgba(255,255,255,0.15)',
      backdropFilter: 'blur(4px)',
      cursor: 'pointer',
      fontSize: 18,
      color: '#FFF',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background 0.2s',
    },

    // Absolute Viewport Close Button (Top Right)
    closeModalBtn: {
      position: 'absolute',
      top: 20,
      right: 20,
      width: 40,
      height: 40,
      borderRadius: '50%',
      background: 'rgba(0, 0, 0, 0.6)',
      border: '1.5px solid rgba(255, 255, 255, 0.2)',
      color: '#FFF',
      cursor: 'pointer',
      fontSize: 16,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 210,
    },
    capturedActions: {
      display: 'flex', gap: 12, marginTop: 8, width: '100%', maxWidth: 400,
    },
    sendCaptureBtn: {
      flex: 2, background: 'linear-gradient(135deg, #F5A623, #FF8C00)', color: '#FFF',
      border: 'none', borderRadius: 14, padding: '14px', cursor: 'pointer',
      fontWeight: 700, fontSize: 15, fontFamily: 'inherit',
    },
    retakeBtn: {
      flex: 1, background: 'rgba(255,255,255,0.15)', color: '#FFF',
      border: '1.5px solid rgba(255,255,255,0.3)', borderRadius: 14, padding: '14px',
      cursor: 'pointer', fontWeight: 600, fontSize: 14, fontFamily: 'inherit',
    },
    processingOverlay: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.75)', display: 'flex', flexDirection: 'column',
      justifyContent: 'center', alignItems: 'center', gap: 12, zIndex: 10, borderRadius: 20,
    },
    spinner: { width: 40, height: 40, border: '4px solid rgba(255,255,255,0.2)', borderTopColor: '#F5A623', borderRadius: '50%', animation: 'spinChat 0.75s linear infinite' },
    processingText: { color: '#EEE', fontSize: 14, fontWeight: 500 },

    // Braille Panel
    braillePanel: { borderTop: '1px solid #EEE', paddingTop: 12, marginTop: 10 },
    brailleDot: { width: 36, height: 36, borderRadius: '50%', border: '2px solid #DDD', background: '#FAFAFA', cursor: 'pointer', fontSize: 15 },
    brailleDotFilled: { background: '#F5A623', borderColor: '#F5A623', color: '#FFF' },
    brailleCharDisplay: { textAlign: 'center', fontSize: 28, fontWeight: 700, color: '#F5A623', minHeight: 36 },
    brailleLabel: { fontSize: 11, color: '#999', marginTop: 2 },
    brailleBtns: { display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' },
    brailleBtn: {
      borderRadius: 10, padding: '8px 16px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
      border: 'none', fontFamily: 'inherit',
    },
    brailleBtnPrimary: { background: '#F5A623', color: '#FFF' },
    brailleBtnSecondary: { background: '#F0F0F0', color: '#666' },
    brailleBtnDanger: { background: '#FFF0EE', color: '#D94A4A' },

    errorBanner: {
      background: '#FFF0EE', border: '1px solid rgba(217,74,74,0.2)', color: '#D94A4A',
      padding: '10px 14px', borderRadius: 12, fontSize: 13, margin: '8px 16px', textAlign: 'center',
    },

    dateSeparator: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      margin: '16px 0 12px',
      gap: 12,
    },
    dateSeparatorLine: {
      flex: 1,
      height: '1px',
      backgroundColor: '#E0E0E0',
    },
    dateSeparatorText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#999',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },

    // closeModalBtn: {
    //   position: 'absolute', top: 14, right: 14, width: 36, height: 36, borderRadius: 50,
    //   background: 'rgba(0,0,0,0.5)', border: 'none', color: '#FFF', cursor: 'pointer',
    //   fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
    //   zIndex: 15,
    // },
  };

  // Braille Component
  const BraillePanel = showBrailleInput ? (() => {
    const CELL_MAP = {
      'a':1,'b':3,'c':9,'d':25,'e':27,'f':11,'g':19,'h':21,'i':5,'j':23,
      'k':33,'l':35,'m':41,'n':43,'o':45,'p':37,'q':39,'r':29,'s':31,'t':47,
      'u':53,'v':55,'w':61,'x':57,'y':59,'z':63,
      '1':1,'2':3,'3':9,'4':25,'5':27,'6':11,'7':19,'8':21,'9':5,'0':23,
    };
    const toggle = (idx) => {
      const next = [...brailleCells]; next[idx] = brailleCells[idx] ? '' : '\u25CF'; setBrailleCells(next);
    };
    const val = parseInt(brailleCells.map(c=>c?'1':'0').join('').padEnd(6,'0'),2);
    const char = Object.entries(CELL_MAP).find(([,v])=>v===val)?.[0]||'';
    const addChar = () => { if(char){setInputText(p=>p+char);setBrailleCells(['','','','','','']);} };
    const delChar = () => { setInputText(p=>p.slice(0,-1)); };
    const addSpace = () => { setInputText(p=>p+' '); };

    return (
      <div style={S.braillePanel}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          {[0,1,2].map(i=>(
            <div key={i} style={{display:'flex',flexDirection:'column',gap:5}}>
              {[brailleCells[i],brailleCells[i+3]].map((filled,j)=>(
                <button key={j} onClick={()=>toggle(i+(j===3?3:j))}
                  style={{...S.brailleDot,...(filled ? S.brailleDotFilled : {})}}
                  tabIndex={0}
                  onFocus={() => speak(`Braille dot ${i+1}-${j===0?1:2}. ${filled?'Filled':'Empty'}.`)}
                >{filled||''}</button>
              ))}
            </div>
          ))}
          <div style={{flex:1,textAlign:'center'}}>
            <div style={S.brailleCharDisplay}>{char||'_'}</div>
            <div style={S.brailleLabel}>Braille Character</div>
          </div>
        </div>
        <div style={S.brailleBtns}>
          <button onClick={addChar} style={{...S.brailleBtn,...S.brailleBtnPrimary}} tabIndex={0}
            onFocus={() => char ? speak(`Add ${char} button.`) : speak('Add button. No character selected yet.')}>Add</button>
          <button onClick={addSpace} style={{...S.brailleBtn,...S.brailleBtnSecondary}} tabIndex={0}
            onFocus={() => speak('Space button. Add a space.')}>Space</button>
          <button onClick={delChar} style={{...S.brailleBtn,...S.brailleBtnDanger}} tabIndex={0}
            onFocus={() => speak('Delete button. Delete last character.')}>Del</button>
          <button onClick={()=>{setShowBrailleInput(false);setBrailleCells(['','','','','','']);}}
            style={{...S.brailleBtn,...S.brailleBtnSecondary}} tabIndex={0}
            onFocus={() => speak('Close braille keyboard.')}>Close</button>
        </div>
      </div>
    );
  })() : null;

  return (
    <div style={S.screen} role="main" aria-label="EyeDentify Chat Interface">
      {/* Header */}
      <header style={S.header}>
        <div style={S.logoSection}>
          <div style={S.logoIcon}>{'\u{1F441}\uFE0F'}</div>
          <div>
            <div style={S.logoText}>EyeDentify</div>
            <div style={S.logoSubtext}>AI CHAT</div>
          </div>
        </div>
        <button style={S.headerBtn} onClick={onLogout} aria-label="Logout" title="Logout" tabIndex={0}
          onFocus={() => speak('Logout button. Tap to sign out.')}
        >{'\u{1F6AA}'}</button>
      </header>

      {/* Chat Messages */}
      <div style={S.chatArea} role="log" aria-label="Chat messages" aria-live="polite">
        {messages.length === 0 && !isLoading ? (
          <div style={{ ...S.welcomeCard, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }} role="status">
            <div style={S.welcomeIcon}>{'\u{1F441}\uFE0F'}</div>
            <h2 style={S.welcomeTitle}>Welcome to EyeDentify</h2>
            <p style={S.welcomeText}>
              Your AI vision assistant is ready to help you identify objects, read text, describe scenes, and more.
              <br /><br />Type a message below or tap the camera to scan!
            </p>
          </div>
        ) : (
          (() => {
            const result = [];
            let lastDateKey = null;

            messages.forEach((msg, i) => {
              const currentDateKey = getDateKey(msg.timestamp);

              // Add date separator if date changed
              if (currentDateKey !== lastDateKey) {
                result.push(
                  <div key={`date-${currentDateKey}`} style={S.dateSeparator} role="status">
                    <div style={S.dateSeparatorLine}></div>
                    <span style={S.dateSeparatorText}>{formatDateSeparator(msg.timestamp)}</span>
                    <div style={S.dateSeparatorLine}></div>
                  </div>
                );
                lastDateKey = currentDateKey;
              }

              // Add message
              result.push(
                <div key={i} style={{ ...S.msgRow, ...(msg.role==='user'?S.msgRowUser:{}) }} role="article" tabIndex={0}
                  onFocus={() => {
                    const sender = msg.role === 'user' ? 'You said' : 'AI replied';
                    speak(`${sender}: ${msg.text}`);
                  }}
                >
                  <div>
                    {/* Added onClick handler and cursor pointer here */}
                    <div 
                      onClick={() => {
                        const sender = msg.role === 'user' ? 'You said' : 'EyeDentify AI';
                        speak(`${sender}: ${msg.text}`);
                      }}
                      style={{
                        ...S.bubble,
                        ...(msg.role==='user' ? S.bubbleUser : (msg.isError ? S.bubbleError : S.bubbleBot)),
                        cursor: 'pointer' 
                      }}
                    >
                      <span>{msg.text}</span>
                      {msg.image && <img src={msg.image} alt="Captured" style={S.msgImg} />}
                      {msg.imageUri && !msg.image && <img src={msg.imageUri} alt="Memory" style={S.msgImg} />}
                      {msg.audioBase64 && (
                        <div style={{ marginTop: 8 }}>
                          <audio controls style={S.audioPlayer} ref={(el) => {
                            if (el && msg.audioBase64) el.src = `data:audio/mp3;base64,${msg.audioBase64}`;
                          }} />
                        </div>
                      )}
                    </div>
                    <div style={{ ...S.msgMeta, ...(msg.role==='user'?{}:S.msgMetaBot) }}>
                      <span style={{ ...S.msgSender, ...(msg.role==='user'?{}:S.msgSenderBot) }}>
                        {msg.role === 'user' ? 'You' : 'EyeDentify AI'}
                      </span>
                      <span style={S.msgTime}>{formatTime(msg.timestamp)}</span>
                    </div>
                  </div>
                </div>
              );
            });

            return result;
          })()
        )}

        {/* Typing indicator */}
        {isLoading && messages.length > 0 && (
          <div style={S.typingIndicator} role="status" aria-label="AI typing">
            <div style={{...S.dot, animationDelay:'0s'}}></div>
            <div style={{...S.dot, animationDelay:'0.2s'}}></div>
            <div style={{...S.dot, animationDelay:'0.4s'}}></div>
          </div>
        )}
        
        <div ref={chatEndRef} />
      </div>

      {/* Input Area */}
      <div style={S.inputArea} role="form" aria-label="Message input">
        <div style={S.inputRow}>
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your question here..."
            style={S.inputBox}
            rows={1}
            disabled={isLoading}
            aria-label="Type your message"
            tabIndex={0}
            onFocus={() => speak('Message input. Type your question here, then press Enter or Tab to Send button.')}
          />
          <div style={S.actionBtns}>
            <button
              onClick={() => startCamera()}
              title="Open Camera"
              style={S.iconBtn}
              aria-label="Open camera for vision"
              tabIndex={0}
              onFocus={() => speak('Camera button. Tap to open camera and take a photo.')}
            >{'\u{1F4F7}'}</button>

            <button
              onClick={toggleVoiceMessage}
              title="Voice Message"
              disabled={isLoading}
              style={{
                ...S.iconBtn,
                ...(isVoiceRecording ? {background:'#FFF0EE',color:'#D94A4A',borderColor:'#D94A4A'} : {background:'#E8F8EC',color:'#4CAF50',borderColor:'#4CAF50'}),
                opacity: isLoading ? 0.4 : 1,
              }}
              aria-label={isVoiceRecording ? "Stop recording" : "Start voice recording"}
              tabIndex={0}
              onFocus={() => speak(isVoiceRecording ? 'Stop recording button. Tap to stop.' : 'Voice record button. Tap to start recording.')}
            >{isVoiceRecording ? '\u{1F534}' : '\uD83C\uDFA4'}</button>

            {/* <button
              onClick={() => setShowBrailleInput(!showBrailleInput)}
              title="Braille Input"
              style={{ ...S.iconBtn, ...(showBrailleInput ? {background:'#FFF8EE',color:'#F5A623',borderColor:'#F5A623'}:{}) }}
              aria-label="Toggle braille input"
              tabIndex={0}
              onFocus={() => speak('Braille input button. Tap to toggle braille keyboard.')}
            >{'\u28FF'}</button> */}

            <button
              onClick={() => setShowBrailleInput(!showBrailleInput)}
              title="Braille Input"
              style={{ ...S.iconBtn, ...(showBrailleInput ? {background:'#FFF8EE',color:'#F5A623',borderColor:'#F5A623'}:{}) }}
              aria-label="Toggle braille input"
              tabIndex={0}
              onFocus={() => speak('Braille input button. Tap to toggle braille keyboard.')}
            >
              {/* Copy from here */}
              <svg 
                width="16" 
                height="22" 
                viewBox="0 0 16 22" 
                fill="currentColor" 
                style={{ display: 'block' }}
              >
                {/* Left Column Dots */}
                <circle cx="3" cy="3" r="2" />
                <circle cx="3" cy="11" r="2" />
                <circle cx="3" cy="19" r="2" />
                
                {/* Right Column Dots */}
                <circle cx="13" cy="3" r="2" />
                <circle cx="13" cy="11" r="2" />
                <circle cx="13" cy="19" r="2" />
              </svg>
              {/* To here */}
            </button>

            <button
              onClick={sendMessage}
              disabled={isLoading || (!inputText.trim())}
              style={{ ...S.sendBtn, ...((!inputText.trim()||isLoading)?S.sendDisabled:{}) }}
              aria-label={!inputText.trim() ? "Send disabled" : "Send message"}
              tabIndex={0}
              onFocus={() => !inputText.trim() ? null : speak('Send button. Tap to send your message.') }
            >SEND {'\u25B6'}</button>
          </div>
        </div>
        {BraillePanel}
      </div>

      {/* Camera Modal */}
      {showCameraModal && (
        <div style={S.modalOverlay} role="dialog" aria-label="Camera">
          <button style={S.closeModalBtn} onClick={() => { stopCamera(); setCapturedImage(null); }} aria-label="Close camera" tabIndex={0}
            onFocus={() => speak('Close camera.')}
          >{'\u2715'}</button>
          
          {cameraError && <div style={S.errorBanner} role="alert">{cameraError}</div>}

          {!capturedImage ? (
            <>
              <div style={S.modalPreview}>
                <video ref={videoRef} autoPlay playsInline muted style={S.modalVideo} />
                
                {processingAction && (
                  <div style={S.processingOverlay} role="status">
                    <div style={S.spinner}></div>
                    <div style={S.processingText}>{processingAction}</div>
                  </div>
                )}
                
                {/* Clean, Three-Column Control Bar */}
                <div style={S.modalControls}>
                  <button 
                    onClick={switchCamera} 
                    style={S.modalActionBtn} 
                    aria-label="Switch camera lens" 
                    tabIndex={0}
                    onFocus={() => speak('Switch camera lens button.')}
                  >
                    🔄
                  </button>

                  <button 
                    onClick={captureImage} 
                    style={S.captureBtn} 
                    aria-label="Capture photo" 
                    tabIndex={0}
                    onFocus={() => speak('Capture button. Tap to take a photo.')}
                  >
                    📷
                  </button>

                  <button 
                    onClick={stopCamera} 
                    style={S.modalActionBtn} 
                    aria-label="Dismiss camera window" 
                    tabIndex={0}
                    onFocus={() => speak('Dismiss camera button.')}
                  >
                    ✕
                  </button>
                </div>
              </div>
              
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </>
          ) : (
            <>
              <div style={S.modalPreview}>
                <img src={capturedImage} alt="Captured preview" style={S.modalCaptured} />
                
                {processingAction && (
                  <div style={S.processingOverlay} role="status">
                    <div style={S.spinner}></div>
                    <div style={S.processingText}>{processingAction}</div>
                  </div>
                )}
              </div>
              
              <div style={S.capturedActions}>
                <button onClick={handleCaptureAndSend} disabled={!!processingAction} style={S.sendCaptureBtn} aria-label="Analyze & Send" tabIndex={0}
                  onFocus={() => speak(processingAction ? 'Analyzing image.' : 'Analyze and send button. Tap to process image.')}>
                  {processingAction ? 'Analyzing...' : 'Analyze & Send'}
                </button>
                <button onClick={handleRetakePhoto} style={S.retakeBtn} aria-label="Retake photo" tabIndex={0}
                  onFocus={() => speak('Retake button. Take another photo.')}>Retake</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes fadeInUp { 
          from { opacity: 0; transform: translateY(8px); } 
          to { opacity: 1; transform: translateY(0); } 
        }
        @keyframes bounceTyping {
          0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes spinChat { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

function speak(text) {
  // SILENCE GUARD: If the user is recording, block ALL incoming speech requests instantly
  if (window.isRecordingVoice) return;

  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    speechSynthesis.speak(u);
  }
}

// function speak(text) {
//   if ('speechSynthesis' in window) {
//     speechSynthesis.cancel();
//     const u = new SpeechSynthesisUtterance(text);
//     u.rate = 0.9;
//     speechSynthesis.speak(u);
//   }
// }

export default ChatScreen;
