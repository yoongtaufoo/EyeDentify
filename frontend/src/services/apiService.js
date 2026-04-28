/**
 * apiService.js - Shared API service layer.
 * All backend communication goes through this module.
 * 
 * Your teammate can also reference this file to understand the API contract.
 */

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://192.168.100.9:8000';

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
 * Returns: { description, objects, memory_id }
 */
export async function processImage(userId, imageUri) {
  const formData = new FormData();
  formData.append('user_id', userId);
  formData.append('source', 'phone');
  
  // React Native requires different format for file uploads
  const uriParts = imageUri.split('.');
  const fileType = uriParts[uriParts.length - 1] === 'jpg' ? 'jpeg' : uriParts[uriParts.length - 1];
  
  formData.append('image', {
    uri: imageUri,
    name: 'photo.jpg',
    type: `image/${fileType}`,
  });

  const response = await fetch(`${BACKEND_URL}/vision/process`, {
    method: 'POST',
    body: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
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
  
  const params = new URLSearchParams({
    user_id: userId,
    message,
  });
  if (memoryId) params.append('current_memory_id', memoryId);
  if (description) params.append('current_description', description);

  const response = fetch(`${BACKEND_URL}/chat/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  
  const data = await (await response).json();
  if (!response.ok) throw new Error(data.detail || 'Chat failed');
  return data;
}

/**
 * Send audio recording + optional text to chatbot.
 * Audio is base64-encoded string from expo-av.
 */
export async function sendAudioMessage(userId, audioBase64, options = {}) {
  const { memoryId, description } = options;
  
  const params = new URLSearchParams({ user_id: userId });
  params.append('audio_base64', audioBase64);
  if (memoryId) params.append('current_memory_id', memoryId);
  if (description) params.append('current_description', description);

  const response = await fetch(`${BACKEND_URL}/chat/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'Chat failed');
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
      return []; // Return empty list instead of crashing
    }

    // 3. Only parse if it looks like JSON
    const data = JSON.parse(rawText);
    return data.history || [];
  } catch (error) {
    console.error("Network Error:", error.message);
    // Let the user know without a red screen
    return []; 
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
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  // FIX: Read as text first to catch "Internal Server Error" strings
  const rawResponse = await response.text();
  
  if (rawResponse.startsWith("I") || !response.ok) {
    console.error("BACKEND CRASHED:", rawResponse);
    throw new Error("Backend Error");
  }

  return JSON.parse(rawResponse);
}