import { useRef, useCallback } from 'react';
import { useAudioRecorder, RecordingPresets, setAudioModeAsync,
  INTERRUPTION_MODE_IOS_DO_NOT_MIX, INTERRUPTION_MODE_ANDROID_DO_NOT_MIX } from 'expo-audio';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { agentInteract } from '../services/apiService';

/**
 * Speak text with options optimized for background/lock-screen playback.
 */
const speak = (text, options = {}) => {
  if (!text) return;
  Speech.speak(text, {
    rate: 0.9,
    volume: 1.0,
    pitch: 1.0,
    ...options,
  });
};

/**
 * Ensure audio session is active and configured for background playback.
 */
const ensureAudioSession = async () => {
  try {
    await setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      interruptionModeIOS: INTERRUPTION_MODE_IOS_DO_NOT_MIX,
      interruptionModeAndroid: INTERRUPTION_MODE_ANDROID_DO_NOT_MIX,
      shouldDuckAndroid: false,
    });
  } catch (e) {
    console.warn('[Audio] Session re-apply warning:', e.message);
  }
};

/**
 * waitForSpeechDone - Polls expo-speech until TTS finishes.
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
 * useAudioListener - Custom hook for microphone recording + backend transcription.
 *
 * Uses expo-audio v1's useAudioRecorder hook (works in Expo Go).
 *
 * RETURNS: { startListening } — call startListening(userId, onTranscriptionReceived)
 *          Returns a { stop } object for manual early termination.
 *
 * Usage in component:
 *   const { startListening } = useAudioListener();
 *   // Later:
 *   const ctrl = await startListening(userId, callback);
 *   ctrl.stop(); // optional early stop
 */
export const useAudioListener = () => {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const isFinishedRef = useRef(false);
  const callbackRef = useRef(null);

  const startListening = useCallback(async (userId, onTranscriptionReceived) => {
    callbackRef.current = onTranscriptionReceived;
    isFinishedRef.current = false;

    const finishRecording = async () => {
      // Guard: prevent double-stop (manual + auto-stop race)
      if (isFinishedRef.current) return;
      isFinishedRef.current = true;

      const cb = callbackRef.current;
      if (typeof cb === 'function') {
        cb.__processing?.(true);
      }

      try {
        if (!recorder || !recorder.isRecording) return;

        // Stop recorder
        await recorder.stop();

        const uri = recorder.uri;
        if (!uri) {
          cb?.__processing?.(false);
          return;
        }

        const base64 = await FileSystemLegacy.readAsStringAsync(uri, {
          encoding: FileSystemLegacy.EncodingType?.Base64 || 'base64',
        });

        speak('Processing.');
        await waitForSpeechDone();

        const result = await agentInteract(userId, { audioBase64: base64 });

        if (result && result.audio_text) {
          cb(result.audio_text);
          const isPassword = cb.__fieldType === 'password';
          if (isPassword) {
            const dotCount = result.audio_text.length;
            speak(`Password received. ${dotCount} characters.`);
          } else {
            speak(`I heard: ${result.audio_text}`);
          }
          ensureAudioSession();
        } else {
          cb('');
        }
      } catch (error) {
        console.error('[Audio] Error finishing recording:', error.message);
        cb?.('');
      } finally {
        cb?.__processing?.(false);
      }
    };

    try {
      // Request mic permission — try expo-audio v1 API, fallback to recorder.prepare
      let permissionGranted = false;
      try {
        const AudioModule = require('expo-audio').AudioModule;
        if (AudioModule && typeof AudioModule.requestRecordingPermissionsAsync === 'function') {
          const perm = await AudioModule.requestRecordingPermissionsAsync();
          permissionGranted = !!perm?.granted;
        }
      } catch (permErr) {
        console.log('[Audio] requestRecordingPermissionsAsync not available, trying prepareToRecord...');
      }

      if (!permissionGranted) {
        // Fallback: prepareToRecordAsync will also trigger the permission prompt
        try {
          await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
          permissionGranted = true;
        } catch (prepErr) {
          console.warn('[Audio] Permission denied via prepare:', prepErr.message);
        }
      }

      if (!permissionGranted) {
        speak('Microphone permission denied.');
        return { stop: () => {} };
      }

      // Wait for any ongoing speech before opening mic
      await waitForSpeechDone();

      // Configure audio mode for recording
      await setAudioModeAsync({ allowsRecording: true, playsInSilentModeIOS: true });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      speak('Listening.');
      await waitForSpeechDone();

      // Start recording — if not already prepared, prepare first
      if (!recorder.isPrepared) {
        await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
      }
      recorder.record();

      // No auto-stop — user controls when to stop via returned .stop()
      console.log('[Audio] Recording started. Waiting for manual stop.');

      // Return control object for manual stop
      return {
        stop: () => {
          console.log('[Audio] Manual stop requested by user');
          finishRecording();
        },
      };

    } catch (error) {
      console.error('Audio Error:', error.message);
      speak('Audio system error.');
      return { stop: () => {} };
    }
  }, [recorder]);

  return { startListening };
};
