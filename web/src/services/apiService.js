/**
 * apiService.js - Shared API service layer (Web).
 * All backend communication goes through this module.
 */

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

// ============================================================
// AUTH
// ============================================================

export async function signup(email, password, fullName = '', keyboardType = 'normal') {
  const formData = new FormData();
  formData.append('email', email);
  formData.append('password', password);
  formData.append('full_name', fullName);
  formData.append('keyboard_type', keyboardType);

  const response = await fetch(`${BACKEND_URL}/auth/signup`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMsg = typeof data.detail === 'object'
      ? JSON.stringify(data.detail)
      : (data.detail || 'Signup failed');
    throw new Error(errorMsg);
  }
  return data;
}

export async function login(email, password) {
  const formData = new FormData();
  formData.append('email', email);
  formData.append('password', password);

  const response = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || data.error_description || 'Login failed');
  return data;
}

// ============================================================
// VISION - Upload image for AI analysis
// ============================================================

export async function processImage(userId, imageBase64) {
  // Strip dataURL prefix if present: "data:image/jpeg;base64,/9j/..." -> "/9j/..."
  const cleanBase64 = imageBase64.includes(',')
    ? imageBase64.split(',')[1]
    : imageBase64;

  const formData = new FormData();
  formData.append('user_id', userId);
  formData.append('source', 'phone');
  formData.append('image_base64', cleanBase64);

  const response = await fetch(`${BACKEND_URL}/vision/process`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'Vision processing failed');
  return data;
}

// ============================================================
// CHAT
// ============================================================

export async function sendChatMessage(userId, message, options = {}) {
  const opts = options || {};
  const { memoryId, description } = opts;

  const formData = new FormData();
  formData.append('user_id', userId);
  formData.append('message', message);
  if (memoryId) formData.append('current_memory_id', memoryId);
  if (description) formData.append('current_description', description);

  const response = await fetch(`${BACKEND_URL}/chat/send`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'Chat failed');
  return data;
}

export async function sendAudioMessage(userId, audioBase64, options = {}) {
  const { memoryId, description } = options;

  const formData = new FormData();
  formData.append('user_id', userId);
  formData.append('message', 'audio');
  formData.append('audio_base64', audioBase64);
  if (memoryId) formData.append('current_memory_id', memoryId);
  if (description) formData.append('current_description', description);

  const response = await fetch(`${BACKEND_URL}/chat/send`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map((e) => e.msg).join(', ')
      : (data.detail || 'Chat failed');
    throw new Error(detail);
  }

  return data;
}

export async function getChatHistory(userId) {
  try {
    const response = await fetch(`${BACKEND_URL}/chat/history?user_id=${userId}`);
    const rawText = await response.text();

    if (!response.ok || rawText.startsWith('I')) {
      console.warn('[API] Backend error:', rawText);
      return [];
    }

    const data = JSON.parse(rawText);
    return data.history || [];
  } catch (error) {
    console.error('[API] History load error:', error.message);
    return [];
  }
}

// ============================================================
// TTS - Text-to-Speech (backend-generated audio)
// ============================================================

export async function getTTSAudio(text, voice = null) {
  const formData = new FormData();
  formData.append('text', text);
  if (voice) formData.append('voice', voice);

  const response = await fetch(`${BACKEND_URL}/chat/tts`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'TTS generation failed');
  return data; // { audio_base64, format: "mp3", success }
}

export async function sendChatMessageWithAudio(userId, message, options = {}) {
  const { memoryId, description } = options;

  const formData = new FormData();
  formData.append('user_id', userId);
  formData.append('message', message);
  if (memoryId) formData.append('current_memory_id', memoryId);
  if (description) formData.append('current_description', description);

  const response = await fetch(`${BACKEND_URL}/chat/send-audio`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'Chat+Audio failed');
  // Returns: { response, audio_base64, audio_text }
  return data;
}
