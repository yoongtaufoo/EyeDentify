// import { Audio } from 'expo-audio';
// import * as Speech from 'expo-speech';
// import * as Haptics from 'expo-haptics';
// import * as FileSystem from 'expo-file-system';
// import { sendAudioMessage } from '../services/apiService';

// export const startListeningFlow = async (userId, onTranscriptionReceived) => {
//   try {
//     // 1. Request Permissions
//     const permission = await Audio.requestPermissionsAsync();
//     if (!permission.granted) {
//       Speech.speak("Microphone permission is required.");
//       return;
//     }

//     // 2. Tactile Cue
//     await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
//     Speech.speak("Listening now. Speak your email clearly.");

//     // 3. New SDK 54 Recording Logic
//     const recording = await Audio.recordAsync({
//       encoder: Audio.AudioEncoder.AAC,
//       sampleRate: 44100,
//       bitRate: 128000,
//     });

//     // We let it record for 5 seconds for the email, then stop
//     setTimeout(async () => {
//       await recording.stop();
//       const uri = recording.uri;
      
//       // 4. Convert to Base64 for the backend
//       const base64 = await FileSystem.readAsStringAsync(uri, {
//         encoding: FileSystem.EncodingType.Base64,
//       });

//       Speech.speak("Processing your voice...");

//       // 5. Send to your FastAPI backend for Whisper transcription
//       const result = await sendAudioMessage(userId, base64);
      
//       if (result.response) {
//         onTranscriptionReceived(result.response);
//         Speech.speak(`I heard: ${result.response}. If this is correct, scan your finger.`);
//       }
//     }, 5000);

//   } catch (error) {
//     console.error("Audio Flow Error:", error);
//     Speech.speak("Sorry, I couldn't hear that clearly. Please try again.");
//   }
// };

// ##########################################################

// src/utils/audioHandler.js
// import { 
//   requestMicrophonePermissionsAsync, // Specific permission function
//   useAudioRecorder, 
//   RecordingOptionsPresets 
// } from 'expo-audio'; 
// import * as Speech from 'expo-speech';
// import * as Haptics from 'expo-haptics';
// import * as FileSystem from 'expo-file-system';
// import { agentInteract } from '../services/apiService';

// export const startListeningFlow = async (userId, onTranscriptionReceived) => {
//   try {
//     // 1. New SDK 54 Permission Call
//     const permission = await requestMicrophonePermissionsAsync();
    
//     if (!permission.granted) {
//       Speech.speak("Microphone permission is required for audio mode.");
//       return;
//     }

//     // 2. Tactile Feedback
//     await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
//     Speech.speak("Listening. Please speak your email.");

//     // 3. Start Recording (Simplified for demo)
//     // Note: In a real app, you'd use the useAudioRecorder hook in a component,
//     // but for this utility, we'll use the recordAsync helper.
//     const recording = await Audio.recordAsync(RecordingOptionsPresets.HIGH_QUALITY);

//     setTimeout(async () => {
//       await recording.stop();
//       const uri = recording.uri;
      
//       const base64 = await FileSystem.readAsStringAsync(uri, {
//         encoding: FileSystem.EncodingType.Base64,
//       });

//       Speech.speak("Processing voice...");

//       const result = await agentInteract(userId, { audioBase64: base64 });
      
//       if (result.audio_text) {
//         onTranscriptionReceived(result.audio_text);
//         Speech.speak(`I heard ${result.audio_text}. Swipe left to continue.`);
//       }
//     }, 4000); // Record for 4 seconds

//   } catch (error) {
//     console.error("Audio Flow Error:", error);
//     Speech.speak("I couldn't hear you. Please try again.");
//   }
// };

// #################################

// import * as Audio from 'expo-audio'; // Import the whole module to be safe
// import * as Speech from 'expo-speech';
// import * as Haptics from 'expo-haptics';
// import * as FileSystem from 'expo-file-system';
// import { agentInteract } from '../services/apiService';

// export const startListeningFlow = async (userId, onTranscriptionReceived) => {
//   try {
//     // Correct method name for expo-audio SDK 54+
//     const permission = await Audio.requestPermissionsAsync();
    
//     if (!permission.granted) {
//       Speech.speak("Microphone permission denied.");
//       return;
//     }

//     // Tactile vibration cue (No beep)
//     await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
//     Speech.speak("Listening. Speak your email.");

//     // Start recording
//     const recording = await Audio.recordAsync();

//     // Record for 4 seconds then process
//     setTimeout(async () => {
//       await recording.stop();
//       const uri = recording.uri;
      
//       const base64 = await FileSystem.readAsStringAsync(uri, {
//         encoding: FileSystem.EncodingType.Base64,
//       });

//       Speech.speak("Processing...");

//       const result = await agentInteract(userId, { audioBase64: base64 });
      
//       if (result && result.audio_text) {
//         onTranscriptionReceived(result.audio_text);
//         Speech.speak(`I heard ${result.audio_text}. If correct, scan your finger.`);
//       }
//     }, 4000);

//   } catch (error) {
//     console.error("Audio Flow Error:", error);
//     Speech.speak("I didn't catch that. Try again.");
//   }
// };

// ################################

// src/utils/audioHandler.js
import { requestPermissionsAsync, recordAsync } from 'expo-audio'; // Correct named imports
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import { agentInteract } from '../services/apiService';

// export const startListeningFlow = async (userId, onTranscriptionReceived) => {
//   try {
//     // console.log("LOG: Requesting Mic Permissions...");
    
//     // // SDK 54 Name: requestPermissionsAsync (NOT requestMicrophonePermissionsAsync)
//     // const permission = await requestPermissionsAsync();
    
//     // if (!permission.granted) {
//     //   Speech.speak("Microphone permission is required.");
//     //   return;
//     // }

//     // // Vibration only (No Beep)
//     // Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
//     // Speech.speak("Listening. Speak your email clearly.");

//     // // Start recording with SDK 54
//     // const recording = await recordAsync();

//     console.log("LOG: Checking existing permissions...");
    
//     // First, check if we ALREADY have it
//     let { granted, canAskAgain } = await getPermissionsAsync();
    
//     if (!granted && canAskAgain) {
//       console.log("LOG: Not granted, requesting now...");
//       const request = await requestPermissionsAsync();
//       granted = request.granted;
//     }

//     if (!granted) {
//       Speech.speak("Microphone access denied. Please enable it in settings.");
//       return;
//     }

//     console.log("LOG: Permission GRANTED. Starting record...");
//     Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
//     Speech.speak("Listening now.");

//     const recording = await recordAsync();

//     // Wait 4 seconds for the user to speak the email
//     setTimeout(async () => {
//       await recording.stop();
//       const uri = recording.uri;
      
//       const base64 = await FileSystem.readAsStringAsync(uri, {
//         encoding: FileSystem.EncodingType.Base64,
//       });

//       Speech.speak("Processing...");

//       const result = await agentInteract(userId, { audioBase64: base64 });
      
//       if (result && result.audio_text) {
//         onTranscriptionReceived(result.audio_text);
//         Speech.speak(`I heard ${result.audio_text}. If correct, scan your finger.`);
//       }
//     }, 4000);

//   } catch (error) {
//     console.log("Audio Error Log:", error.message);
//     Speech.speak("Voice input failed. Try again.");
//   }
// };

// export const startListeningFlow = async (userId, onTranscriptionReceived) => {
//   try {
//     console.log("LOG: Initializing iOS-stable permission check...");

//     // 1. CHECK status first (The Fix from GitHub Issue #18410)
//     let permission = await ExpoAudio.getPermissionsAsync();
    
//     // 2. Only REQUEST if not already granted
//     if (permission.status !== 'granted') {
//       console.log("LOG: Permission not granted, requesting now...");
//       permission = await ExpoAudio.requestPermissionsAsync();
//     }

//     if (permission.status !== 'granted') {
//       Speech.speak("Microphone access is denied.");
//       return;
//     }

//     // 3. PROCEED with recording once confirmed
//     console.log("LOG: Permission confirmed. Starting record...");
//     Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
//     Speech.speak("Listening.");

//     const recording = await ExpoAudio.recordAsync();

//     setTimeout(async () => {
//       await recording.stop();
//       const uri = recording.uri;
      
//       const base64 = await FileSystem.readAsStringAsync(uri, {
//         encoding: FileSystem.EncodingType.Base64,
//       });

//       Speech.speak("Processing.");

//       const result = await agentInteract(userId, { audioBase64: base64 });
      
//       if (result && result.audio_text) {
//         onTranscriptionReceived(result.audio_text);
//         Speech.speak(`I heard: ${result.audio_text}`);
//       }
//     }, 4000);

//   } catch (error) {
//     console.log("Audio Error Log:", error.message);
//     Speech.speak("Voice input failed. Try again.");
//   }
// };

export const startListeningFlow = async (userId, onTranscriptionReceived) => {
  try {
    console.log("LOG: Requesting permissions via named import...");

    // Directly call the imported function
    const permission = await requestPermissionsAsync();
    
    if (!permission.granted) {
      Speech.speak("Microphone permission denied.");
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Speech.speak("Listening.");

    const recording = await recordAsync();

    setTimeout(async () => {
      await recording.stop();
      // ... same processing logic as before
    }, 4000);

  } catch (error) {
    console.error("Audio Error:", error.message);
    Speech.speak("Audio system error.");
  }
};