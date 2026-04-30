import * as ExpoAudio from 'expo-audio';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system';
import { agentInteract } from '../services/apiService';

/**
 * waitForSpeechDone - Polls expo-speech until TTS finishes.
 * Returns a promise that resolves when no longer speaking.
 */
const waitForSpeechDone = async () => {
  await new Promise((r) => setTimeout(r, 200));
  let attempts = 0;
  while (await Speech.isSpeakingAsync()) {
    await new Promise((r) => setTimeout(r, 150));
    attempts++;
    if (attempts > 80) break;
  }
};

/**
 * startListeningFlow - Handles microphone permissions, recording, and backend transcription.
 *
 * Does NOT call Speech.speak() before recording — the caller must speak its
 * prompt FIRST. Waits for TTS to finish so the mic captures only user voice.
 *
 * RETURNS: { stop } — call stop() to manually end recording early (e.g., Stop button).
 */
export const startListeningFlow = async (userId, onTranscriptionReceived) => {
  let recording = null;
  let autoStopTimer = null;
  let isFinished = false;

  const finishRecording = async () => {
    if (isFinished) return;
    isFinished = true;

    if (autoStopTimer) {
      clearTimeout(autoStopTimer);
      autoStopTimer = null;
    }

    try {
      if (!recording) return;

      // Stop recording — try modern API first, fallback to legacy
      try {
        if (typeof recording.stopAndUnloadAsync === 'function') {
          await recording.stopAndUnloadAsync();
        } else if (typeof recording.stop === 'function') {
          await recording.stop();
        }
      } catch (stopErr) {
        console.warn('[Audio] Recording stop warning:', stopErr.message);
      }

      const uri = recording.getURI ? recording.getURI() : recording.uri;
      if (!uri) return;

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      Speech.speak('Processing.');

      const result = await agentInteract(userId, { audioBase64: base64 });

      if (result && result.audio_text) {
        onTranscriptionReceived(result.audio_text);
        Speech.speak(`I heard: ${result.audio_text}`);
      }
    } catch (error) {
      console.error('[Audio] Error finishing recording:', error.message);
    }
  };

  try {
    // Request mic permission
    const permissionFn = ExpoAudio.requestMicrophonePermissionsAsync
      || ExpoAudio.requestPermissionsAsync;
    const permission = await permissionFn();

    if (!permission.granted) {
      Speech.speak('Microphone permission denied.');
      return { stop: () => {} };
    }

    // Wait for any ongoing speech before opening mic
    await waitForSpeechDone();

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Speech.speak('Listening.');
    await waitForSpeechDone();

    // Start recording using the same API as before
    recording = await ExpoAudio.recordAsync();

    // Auto-stop after 4 seconds
    autoStopTimer = setTimeout(() => {
      console.log('[Audio] Auto-stop triggered after 4s');
      finishRecording();
    }, 4000);

    // Return control object for manual stop
    return {
      stop: () => {
        console.log('[Audio] Manual stop requested by user');
        finishRecording();
      },
    };

  } catch (error) {
    console.error('Audio Error:', error.message);
    Speech.speak('Audio system error.');
    return { stop: () => {} };
  }
};
