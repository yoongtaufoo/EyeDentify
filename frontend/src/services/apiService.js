/**
 * apiService.js - Shared API service layer.
 * All backend communication goes through this module.
 * 
 * Your teammate can also reference this file to understand the API contract.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

// Use environment variable if available, otherwise use relative URL (localhost for development)
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:8000';

// ============================================================
// AUTH
// ============================================================

export async function signup(email, password, fullName, keyboardType = 'normal') {
  const formData = new FormData();
  formData.append('email', email);
  formData.append('password', password);
  formData.append('full_name', fullName || '');
  formData.append('keyboard_type', keyboardType || 'normal');

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

/**
 * Send image to vision pipeline.
 * Returns: { description, objects, memory_id, image_url }
 */
export async function processImage(userId, imageUri) {
  // Resize + compress to keep base64 payload small (< 500KB)
  const manipulated = await manipulateAsync(
    imageUri,
    [{ resize: { width: 800 } }],
    { compress: 0.6, format: SaveFormat.JPEG },
  );

  // On iOS Expo Go, FormData file refs often fail silently ("Network request failed").
  // Solution: read file as base64 first (same pattern that works for audio).
  const base64 = await FileSystem.readAsStringAsync(manipulated.uri, { encoding: 'base64' });

  console.log(`[Vision] Image base64 size: ~${Math.round(base64.length * 0.75 / 1024)}KB`);

  const formData = new FormData();
  formData.append('user_id', userId);
  formData.append('source', 'phone');
  formData.append('image_base64', base64);

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

/**
 * Send a text message to the chatbot.
 * Optionally include context from current image.
 * Returns: { response } where response is assistant's text
 */
export async function sendChatMessage(userId, message, options = {}) {
  const { memoryId, description } = options;
  
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

/**
 * Send audio recording + optional text to chatbot.
 * Audio is base64-encoded string from expo-av.
 */
export async function sendAudioMessage(userId, audioBase64, options = {}) {
  const { memoryId, description } = options;

  const formData = new FormData();
  formData.append('user_id', userId);
  formData.append('message', 'audio'); // placeholder; actual text from audio transcription
  formData.append('audio_base64', audioBase64);
  if (memoryId) formData.append('current_memory_id', memoryId);
  if (description) formData.append('current_description', description);

  const response = await fetch(`${BACKEND_URL}/chat/send`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();

  // Handle validation errors gracefully
  if (!response.ok) {
    const detail = Array.isArray(data.detail)
      ? data.detail.map((e) => e.msg).join(', ')
      : (data.detail || 'Chat failed');
    throw new Error(detail);
  }

  return data;
}

/**
 * Get chat history for a user.
 * Returns array of { id, role, content, created_at }
 */
// export async function getChatHistory(userId, limit = 50) {
//   try {
//     const response = await fetch(`${BACKEND_URL}/chat/history?user_id=${userId}&limit=${limit}`);
//     const text = await response.text(); 
//     if (!response.ok) throw new Error("Backend crashed");
    
//     const data = JSON.parse(text); // Safe parse
//     return data.history || [];
//   } catch (err) {
//     console.error("History fail:", err);
//     return [];
//   }
// }

export async function getChatHistory(userId) {
  try {
    const response = await fetch(`${BACKEND_URL}/chat/history?user_id=${userId}`);
    
    // 1. Get the raw response as text first
    const rawText = await response.text();

    // 2. If the response is not "OK" (like a 500 error), don't try to parse it
    if (!response.ok || rawText.startsWith("I")) {
      console.warn("Backend sent an error:", rawText);
      return null; // Return null to indicate error (distinct from empty history)
    }

    // 3. Only parse if it looks like JSON
    const data = JSON.parse(rawText);
    return data.history || [];
  } catch (error) {
    console.error("Network Error:", error.message);
    // Return null to indicate error so caller can show fallback UI
    return null; 
  }
}

// export async function getChatHistory(userId, limit = 50) {
//   const response = await fetch(`${BACKEND_URL}/chat/history?user_id=${userId}&limit=${limit}`);
//   const text = await response.text(); // GET AS TEXT FIRST
  
//   if (text.startsWith("I")) { // Catch "Internal Server Error"
//     console.error("Backend Crashed");
//     return [];
//   }
  
//   try {
//     const data = JSON.parse(text);
//     return data.history || [];
//   } catch (e) {
//     return [];
//   }
// }
// export async function getChatHistory(userId, limit = 50) {
//   const response = await fetch(
//     `${BACKEND_URL}/chat/history?user_id=${userId}&limit=${limit}`
//   );
//   const data = await response.json();
//   if (!response.ok) throw new Error(data.detail || 'Failed to load history');
//   return data.history;
// }

// ============================================================
// AUDIO TRANSCRIPTION
// ============================================================

/**
 * Send base64 audio to backend for speech-to-text transcription.
 * Returns: { text: string, success: bool }
 */
export async function transcribeAudio(audioBase64) {
  const formData = new FormData();
  formData.append('audio_base64', audioBase64);

  console.log(`[API] Transcribing audio, base64 size: ~${Math.round(audioBase64.length * 0.75 / 1024)}KB`);

  const response = await fetch(`${BACKEND_URL}/audio/transcribe`, {
    method: 'POST',
    body: formData,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'Transcription failed');
  return data;
}

// ============================================================
// COMBINED AGENT ENDPOINT (convenience / legacy)
// ============================================================

/**
 * Combined interact endpoint - handles both vision and chat.
 * This is the main flow: capture -> describe -> user asks question about it or anything else.
 */
// export async function agentInteract(userId, options = {}) {
//   const { imageUri, text, audioBase64 } = options;
  
//   const formData = new FormData();
//   formData.append('user_id', userId);

//   if (imageUri) {
//     const uriParts = imageUri.split('.');
//     const fileType = uriParts[uriParts.length - 1] === 'jpg' ? 'jpeg' : uriParts[uriParts.length - 1];
//     formData.append('image', {
//       uri: imageUri,
//       name: 'scene.jpg',
//       type: `image/${fileType}`,
//     });
//   }

//   if (text) formData.append('text', text);
//   if (audioBase64) formData.append('audio_base64', audioBase64);

//   const response = await fetch(`${BACKEND_URL}/agent/interact`, {
//     method: 'POST',
//     body: formData,
//     headers: { 'Content-Type': 'multipart/form-data' },
//   });

//   const data = await response.json();
//   if (!response.ok) throw new Error(data.detail || 'Agent interaction failed');
//   return data;
// }


export async function agentInteract(userId, options = {}) {
  const { imageUri, text, audioBase64 } = options;
  const formData = new FormData();
  formData.append('user_id', userId);

  if (imageUri) {
    formData.append('image', { uri: imageUri, name: 'scene.jpg', type: 'image/jpeg' });
  }
  if (text) formData.append('text', text);
  if (audioBase64) formData.append('audio_base64', audioBase64);

  const response = await fetch(`${BACKEND_URL}/agent/interact`, {
    method: 'POST',
    body: formData,
    // Do NOT set Content-Type manually — RN fetch needs auto boundary
  });

  // FIX: Read as text first to catch "Internal Server Error" strings
  const rawResponse = await response.text();
  
  if (rawResponse.startsWith("I") || !response.ok) {
    console.error("BACKEND CRASHED:", rawResponse);
    throw new Error("Backend Error");
  }

  return JSON.parse(rawResponse);
}