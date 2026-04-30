/**
 * whisper.js - Web Speech-to-Text using MediaRecorder + AudioContext + backend Whisper API
 * 
 * Key design: Records via MediaRecorder, then converts to WAV format on the frontend
 * before sending to backend. This guarantees Whisper compatibility regardless of
 * what audio formats the browser supports or what's installed on the server.
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

let mediaRecorder = null;
let audioChunks = [];
let stream = null;

export async function startRecording() {
  try {
    // Clean up any previous session
    stopRecording();

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 16000,
      }
    });

    const options = { mimeType: 'audio/webm;codecs=opus' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'audio/webm';
    }
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'audio/ogg';
    }

    mediaRecorder = new MediaRecorder(stream, options);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.start(100); // collect data every 100ms
    return true;
  } catch (err) {
    console.error('[Whisper] Microphone access error:', err);
    throw new Error('Microphone permission denied or unavailable: ' + err.message);
  }
}

export async function stopRecording(userId = null) {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
      resolve('');
      cleanup();
      return;
    }

    mediaRecorder.onstop = async () => {
      try {
        const savedMimeType = mediaRecorder ? mediaRecorder.mimeType : 'audio/webm';
        const blob = new Blob(audioChunks, { type: savedMimeType });
        
        console.log(`[Whisper] Raw recording: ${blob.size} bytes (${savedMimeType})`);
        
        // Convert to WAV format for maximum Whisper compatibility
        const wavBase64 = await convertToWavBase64(blob);
        cleanup();

        if (!wavBase64 || wavBase64.length < 500) {
          console.warn('[Whisper] Audio too short or conversion failed');
          resolve('');
          return;
        }

        console.log(`[Whisper] Sending ${Math.round(wavBase64.length / 1024)}KB WAV to backend...`);
        const text = await transcribeWithBackend(wavBase64, 'audio/wav', userId);
        resolve(text);
      } catch (err) {
        reject(err);
      }
    };

    mediaRecorder.stop();
  });
}

function cleanup() {
  try { if (stream) { stream.getTracks().forEach(t => t.stop()); } } catch {}
  stream = null;
  mediaRecorder = null;
  audioChunks = [];
}

/**
 * Convert any browser audio blob (webm/ogg/etc.) to WAV base64 using AudioContext.
 * This ensures Whisper always receives a format it can natively process.
 */
async function convertToWavBase64(blob) {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    
    // Use OfflineAudioContext (works without speaker output)
    const offlineCtx = new OfflineAudioContext(
      1,  // mono (all Whisper models expect mono)
      44100,  // will be resampled below
      44100  // default context sample rate
    );
    
    const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
    
    // Resample to 16kHz (Whisper native rate, best accuracy)
    const targetSampleRate = 16000;
    const wavBlob = audioBufferToWav(audioBuffer, targetSampleRate);
    
    return await blobToBase64(wavBlob);
  } catch (err) {
    console.error('[Whisper] WAV conversion failed:', err);
    throw err;
  }
}

/**
 * Encode an AudioBuffer as a PCM WAV file (no dependencies needed).
 * Supports resampling to target sample rate.
 */
function audioBufferToWav(audioBuffer, targetSampleRate = 16000) {
  const numChannels = 1; // force mono
  const sampleRate = targetSampleRate;
  
  // Get float data and resample if needed
  let samples;
  if (audioBuffer.numberOfChannels > 0) {
    // Mix down to mono if stereo
    const leftChannel = audioBuffer.getChannelData(0);
    const rightChannel = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : null;
    
    // Simple linear resampling
    const ratio = audioBuffer.sampleRate / sampleRate;
    const newLength = Math.round(leftChannel.length / ratio);
    samples = new Float32Array(newLength);
    
    for (let i = 0; i < newLength; i++) {
      const srcIdx = Math.round(i * ratio);
      if (rightChannel) {
        samples[i] = (leftChannel[srcIdx] + rightChannel[srcIdx]) / 2;
      } else {
        samples[i] = leftChannel[srcIdx];
      }
    }
  } else {
    samples = new Float32Array(0);
  }
  
  // Convert float 32-bit to 16-bit PCM
  const dataLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLength); // 44 byte header + data
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);               // chunk size
  view.setUint16(20, 1, true);                 // PCM format
  view.setUint16(22, numChannels, true);       // channels
  view.setUint32(24, sampleRate, true);        // sample rate
  view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
  view.setUint16(32, numChannels * 2, true);   // block align
  view.setUint16(34, 16, true);                // bits per sample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // Write 16-bit PCM samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result || '';
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read audio blob'));
    reader.readAsDataURL(blob);
  });
}

async function transcribeWithBackend(audioBase64, mimeType, userId = null) {
  const formData = new FormData();
  formData.append('audio_base64', audioBase64);

  console.log(`[Whisper] Sending ${Math.round(audioBase64.length / 1024)}KB of audio to /audio/transcribe (mime: ${mimeType})...`);

  try {
    const response = await fetch(`${BACKEND_URL}/audio/transcribe`, {
      method: 'POST',
      body: formData,
    });

    console.log(`[Whisper] Backend status: ${response.status}`);

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error(`[Whisper] Backend error (${response.status}):`, errData);
      throw new Error(errData.detail || `Backend returned status ${response.status}`);
    }

    const data = await response.json();
    console.log(`[Whisper] Full backend response:`, JSON.stringify(data).substring(0, 500));

    // New endpoint returns { text, success }
    const text = (data.text || data.audio_text || '').trim();

    if (text && (
      text.toLowerCase().includes("couldn't understand") ||
      text.toLowerCase().includes('try again') ||
      text.toLowerCase().includes('error') ||
      text.toLowerCase().includes('failed')
    )) {
      console.warn('[Whisper] Backend returned error-like text:', text);
      throw new Error(text);
    }

    console.log(`[Whisper] Transcribed successfully: "${text}"`);
    return text;
  } catch (err) {
    console.error('[Whisper] Transcription failed:', err.message || err);
    throw err;
  }
}

/** Check if browser supports audio recording */
export function isSpeechSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}
