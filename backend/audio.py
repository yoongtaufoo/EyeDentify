"""
audio.py - Speech-to-text processing.
Converts audio recordings to text using Whisper via OpenAI-compatible API.
Shared by both in-app chat and hardware chat modules.
"""

import os
import base64
import tempfile
from openai import AsyncOpenAI

# Using a STT service - you can swap this out for Whisper, Deepgram, etc.
# Defaulting to z.ai which supports audio transcription
stt_client = AsyncOpenAI(
    api_key=os.getenv("GLM_API_KEY"),
    base_url="https://api.z.ai/v4"
)


async def transcribe_audio(audio_bytes: bytes, mime_type: str = "webm/opus") -> str:
    """
    Transcribe audio bytes to text.
    
    Args:
        audio_bytes: Raw audio recording bytes
        mime_type: MIME type of the audio format
        
    Returns:
        Transcribed text string
    """
    # Write audio to temp file for API submission
    suffix = ".webm" if "webm" in mime_type else (".m4a" if "mp4" in mime_type else ".wav")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as f:
            # Try OpenAI-style transcription API
            import aiofiles
            response = await stt_client.audio.transcriptions.create(
                model="whisper-1",
                file=f,
                language="en",
            )
            return response.text
    except Exception as e:
        print(f"[Audio] Transcription error: {e}")
        # Fallback: return empty string, let chatbot handle it
        return ""
    finally:
        import os as _os
        _os.unlink(tmp_path)


async def transcribe_audio_base64(audio_b64: str, mime_type: str = "webm/opus") -> str:
    """
    Convenience function that accepts base64-encoded audio (how React Native sends it).
    """
    audio_bytes = base64.b64decode(audio_b64)
    return await transcribe_audio(audio_bytes, mime_type)
