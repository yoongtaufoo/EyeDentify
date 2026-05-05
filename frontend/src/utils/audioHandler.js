import { useRef, useCallback } from 'react';
import { useAudioRecorder, RecordingPresets, setAudioModeAsync,
  INTERRUPTION_MODE_IOS_DO_NOT_MIX, INTERRUPTION_MODE_ANDROID_DO_NOT_MIX } from 'expo-audio';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { transcribeAudio } from '../services/apiService';

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
 * RETURNS: { startListening } — call startListening(userId, onTranscriptionReceived, onRecordingStarted?)
 *          Returns a { stop } object for manual early termination (stop is async — await it!).
 *
 * Usage in component:
 *   const { startListening } = useAudioListener();
 *   // Later:
 *   const ctrl = await startListening(userId, callback, () => setReallyListening(true));
 *   await ctrl.stop(); // optional early stop — ALWAYS await this!
 */
export const useAudioListener = () => {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const isFinishedRef = useRef(false);
  const callbackRef = useRef(null);
  const isStoppingRef = useRef(false); // guard against rapid stop → re-record races
  const hasRecordedRef = useRef(false); // track if we've ever recorded (for re-entry cleanup)

  /**
   * Full reset: aggressively cleans up native recorder state.
   * Critical for Android re-entry after navigation.
   */
  const fullResetRecorder = useCallback(async () => {
    console.log('[Audio] fullResetRecorder: starting aggressive cleanup...');
    try {
      // Step 1: Stop if recording
      if (recorder?.isRecording) {
        try { await recorder.stop(); } catch (e) { console.warn('[Audio] Reset: stop error:', e.message); }
      }
      // Step 2: Try to reset audio mode to non-recording
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentModeIOS: true });
      } catch (_) { /* ignore */ }
      // Step 3: Short delay for native resource release
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      console.warn('[Audio] fullResetRecorder error:', e.message);
    }
    isFinishedRef.current = true;
    isStoppingRef.current = false;
    hasRecordedRef.current = true; // mark that we've used the recorder
  }, [recorder]);

  /**
   * Cleanup: stop and reset recorder to a safe state.
   * Safe to call even if recorder is idle.
   */
  const cleanupRecorder = useCallback(async () => {
    try {
      if (recorder) {
        if (recorder.isRecording) {
          await recorder.stop();
        }
        // Reset audio mode so future recordings start clean
        try {
          await setAudioModeAsync({ allowsRecording: false, playsInSilentModeIOS: true });
        } catch (_) { /* ignore */ }
      }
    } catch (e) {
      console.warn('[Audio] cleanupRecorder warning:', e.message);
    }
    isFinishedRef.current = true; // prevent any in-flight finishRecording from acting
    isStoppingRef.current = false;
  }, [recorder]);

  const startListening = useCallback(async (userId, onTranscriptionReceived, onRecordingStarted) => {
    // Guard: don't start a new recording while previous one is still stopping
    if (isStoppingRef.current) {
      console.log('[Audio] Previous recording still stopping, ignoring start');
      return { stop: async () => {} };
    }

    callbackRef.current = onTranscriptionReceived;
    isFinishedRef.current = false;

    const finishRecording = async () => {
      // Guard: prevent double-stop (manual + auto-stop race)
      if (isFinishedRef.current) return;
      isFinishedRef.current = true;
      isStoppingRef.current = true;

      const cb = callbackRef.current;
      if (typeof cb === 'function') {
        cb.__processing?.(true);
      }

      try {
        if (!recorder || !recorder.isRecording) {
          cb?.__processing?.(false);
          isStoppingRef.current = false;
          return;
        }

        // Stop recorder
        await recorder.stop();

        // Reset audio session after recording
        try {
          await setAudioModeAsync({ allowsRecording: false, playsInSilentModeIOS: true });
        } catch (resetErr) {
          console.warn('[Audio] Mode reset warning:', resetErr.message);
        }

        const uri = recorder.uri;
        if (!uri) {
          cb?.__processing?.(false);
          isStoppingRef.current = false;
          return;
        }

        const base64 = await FileSystemLegacy.readAsStringAsync(uri, {
          encoding: FileSystemLegacy.EncodingType?.Base64 || 'base64',
        });

        speak('Processing.');
        await waitForSpeechDone();

        const result = await transcribeAudio(base64);

        if (result && result.text) {
          cb(result.text);
          const isPassword = cb.__fieldType === 'password';
          if (isPassword) {
            const dotCount = result.text.length;
            speak(`Password received. ${dotCount} characters.`);
          } else {
            speak(`I heard: ${result.text}`);
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
        isStoppingRef.current = false; // Allow new recordings now
      }
    };

    try {
      // Request mic permission using AudioModule (same pattern as ChatScreen)
      const AudioModule = require('expo-audio').AudioModule;
      const perm = await AudioModule.requestRecordingPermissionsAsync();
      if (!perm.granted) {
        speak('Microphone permission denied.');
        return { stop: async () => {} };
      }

      // IMMEDIATELY stop any ongoing TTS — don't wait for it to finish
      Speech.stop();
      await new Promise((r) => setTimeout(r, 100));

      // === FIX: Full reset if we've recorded before (re-entry after navigation) ===
      if (hasRecordedRef.current || recorder.isRecording) {
        console.log('[Audio] Previous session detected, running full reset...');
        await fullResetRecorder();
        // Reset refs after full reset so this recording can proceed
        isFinishedRef.current = false;
        isStoppingRef.current = false;
      }

      // Configure audio mode for recording
      await setAudioModeAsync({ allowsRecording: true, playsInSilentModeIOS: true });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      speak('Listening.');
      // Wait for TTS to finish so user knows mic is still loading
      await waitForSpeechDone();

      // Prepare to record — with retry logic for Android IllegalStateException
      let prepareSuccess = false;
      try {
        await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
        prepareSuccess = true;
      } catch (prepareErr) {
        console.warn('[Audio] prepareToRecordAsync failed, attempt 1:', prepareErr.message);
        // On Android, sometimes we need an extra delay after stop before re-prepare
        await new Promise((r) => setTimeout(r, 300));
        // Also reset audio mode again
        try { await setAudioModeAsync({ allowsRecording: false, playsInSilentModeIOS: true }); } catch (_) {}
        await new Promise((r) => setTimeout(r, 150));
        try { await setAudioModeAsync({ allowsRecording: true, playsInSilentModeIOS: true }); } catch (_) {}
        
        try {
          await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
          prepareSuccess = true;
          console.log('[Audio] prepareToRecordAsync succeeded on attempt 2');
        } catch (prepareErr2) {
          console.error('[Audio] prepareToRecordAsync failed on attempt 2:', prepareErr2.message);
          speak('Audio system busy. Please try again.');
          return { stop: async () => {} };
        }
      }

      if (!prepareSuccess) {
        speak('Audio preparation failed. Please try again.');
        return { stop: async () => {} };
      }

      // Start recording — wrap in try/catch for IllegalStateException safety
      try {
        recorder.record();
        hasRecordedRef.current = true; // mark that we've started recording
        // === 2nd vibration: NOW really listening — enable stop button ===
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onRecordingStarted?.();
      } catch (recordErr) {
        console.error('[Audio] recorder.record() threw:', recordErr.message);
        // One more aggressive retry with full reset
        console.log('[Audio] Attempting emergency recovery...');
        try { await recorder.stop(); } catch (_) {}
        await new Promise((r) => setTimeout(r, 400));
        try {
          await setAudioModeAsync({ allowsRecording: true, playsInSilentModeIOS: true });
          await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
          recorder.record();
          hasRecordedRef.current = true;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onRecordingStarted?.();
          console.log('[Audio] Emergency recovery succeeded');
        } catch (recoveryErr) {
          console.error('[Audio] Emergency recovery also failed:', recoveryErr.message);
          speak('Audio system error. Please restart the app.');
          return { stop: async () => {} };
        }
      }

      // No auto-stop — user controls when to stop via returned .stop()
      console.log('[Audio] Recording started. Waiting for manual stop.');

      // Return control object for manual stop (stop IS async — caller must await it!)
      return {
        stop: async () => {
          console.log('[Audio] Manual stop requested by user');
          await finishRecording(); // MUST await to prevent race conditions
        },
      };

    } catch (error) {
      console.error('Audio Error:', error.message);
      speak('Audio system error.');
      isStoppingRef.current = false;
      return { stop: async () => {} };
    }
  }, [recorder]);

  return { startListening, cleanupRecorder, fullResetRecorder };
};
