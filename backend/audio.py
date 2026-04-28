"""
audio.py - Speech-to-text processing.
Converts audio recordings to text using Google Cloud Speech-to-Text API.
Shared by both in-app chat and hardware chat modules.
"""

import os
import base64
import tempfile

from google.cloud import speech_v1p1beta1 as speech


def _get_speech_client():
    """Create a Google Cloud Speech client using credentials from env."""
    # Supports GOOGLE_APPLICATION_CREDENTIALS (service account JSON path)
    # or GOOGLE_CLOUD_API_KEY (API key string for basic usage)
    creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    api_key = os.getenv("GOOGLE_CLOUD_API_KEY")

    if creds_path:
        return speech.SpeechClient.from_service_account_json(creds_path)
    elif api_key:
        # Use default credentials + API key via client options
        from google.api_core.client_options import ClientOptions
        opts = ClientOptions(api_key=api_key, quota_project=None)
        return speech.SpeechClient(client_options=opts)
    else:
        # Fall back to Application Default Credentials (ADC)
        return speech.SpeechClient()


async def transcribe_audio_base64(audio_b64: str) -> str:
    """
    Transcribe base64-encoded audio (from React Native expo-audio recording).
    Uses Google Cloud Speech-to-Text — accurate, fast, supports many languages.

    Args:
        audio_b64: Base64-encoded audio string (expo-audio records as m4a/wav)

    Returns:
        Transcribed text string, or empty string on failure
    """
    try:
        client = _get_speech_client()

        # Decode base64 back to bytes
        audio_bytes = base64.b64decode(audio_b64)

        # Write to temp file (Google Cloud STT accepts file content or raw bytes)
        with tempfile.NamedTemporaryFile(suffix=".m4a", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as f:
                audio_content = f.read()

            # Configure recognition: English, enhanced model, auto punctuation
            config = speech.RecognitionConfig(
                encoding=speech.RecognitionConfig.AudioEncoding.MP4,
                sample_rate_hertz=44100,
                language_code="en-US",
                enable_automatic_punctuation=True,
                model="latest_long",
            )

            audio = speech.Audio(content=audio_content)

            print("[Audio] Sending to Google Cloud STT...")
            response = client.recognize(config=config, audio=audio)

            # Extract full transcription from all results
            parts = []
            for result in response.results:
                if result.alternatives:
                    parts.append(result.alternatives[0].transcript)

            text = " ".join(parts).strip()
            if text:
                print(f"[Audio] Transcribed ({len(text)} chars): {text[:80]}...")
            else:
                print("[Audio] No transcription returned")

            return text

        finally:
            os.unlink(tmp_path)

    except Exception as e:
        print(f"[Audio] Transcription error: {e}")
        return ""
