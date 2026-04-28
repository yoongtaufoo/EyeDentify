import * as ExpoAudio from 'expo-audio';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import { agentInteract } from '../services/apiService';

/**
 * startListeningFlow - Handles microphone permissions, recording, and backend transcription.
 * Optimized for Expo SDK 54.
 */
export const startListeningFlow = async (userId, onTranscriptionReceived) => {
  try {
    console.log("LOG: Requesting permissions via ExpoAudio namespace...");

    // Try both names for compatibility with different Expo Audio versions
    const permission = ExpoAudio.requestMicrophonePermissionsAsync 
      ? await ExpoAudio.requestMicrophonePermissionsAsync()
      : await ExpoAudio.requestPermissionsAsync();
    
    if (!permission.granted) {
      Speech.speak("Microphone permission denied.");
      return;
    }

    // Haptic feedback to indicate listening has started
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Speech.speak("Listening.");

    // Start recording
    const recording = await ExpoAudio.recordAsync();

    // Record for 4 seconds (adjustable)
    setTimeout(async () => {
      await recording.stop();
      
      const uri = recording.uri;
      
      // Convert audio to base64 for backend processing
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      Speech.speak("Processing.");

      // Send to FastAPI backend
      const result = await agentInteract(userId, { audioBase64: base64 });
      
      if (result && result.audio_text) {
        onTranscriptionReceived(result.audio_text);
        Speech.speak(`I heard: ${result.audio_text}`);
      }
    }, 4000);

  } catch (error) {
    console.error("Audio Error:", error.message);
    Speech.speak("Audio system error.");
  }
};
