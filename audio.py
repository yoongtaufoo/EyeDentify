"""
audio.py - Speech-to-text processing.
Uses Groq Cloud Whisper API (free, fast, no local model needed).
Shared by both in-app chat and hardware chat modules.
"""

import os
import base64
import tempfile
import httpx

# Groq Whisper API config (free tier: 20 req/min, no card required)
_GROQ_API_KEY = os.getenv("GROQ_API_KEY")
_GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions"
_WHISPER_MODEL = "whisper-large-v3"


async def transcribe_audio_base64(audio_b64: str) -> str:
    """
    Transcribe base64-encoded audio using Groq's cloud Whisper API.
    No local ML libraries needed — runs entirely in the cloud.

    Args:
        audio_b64: Base64-encoded audio string (WAV from frontend conversion)

    Returns:
        Transcribed text string, or empty string on failure
    """
    if not _GROQ_API_KEY:
        print("[Audio] ERROR: GROQ_API_KEY not set in .env")
        return ""

    try:
        # Decode base64 to bytes
        audio_bytes = base64.b64decode(audio_b64)
        print(f"[Audio] Sending {len(audio_bytes)} bytes to Groq Whisper API...")

        # Write to temp file (API expects multipart file upload)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            # Open file handle for upload, ensure it's closed before cleanup
            file_handle = open(tmp_path, "rb")
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    _GROQ_URL,
                    headers={"Authorization": f"Bearer {_GROQ_API_KEY}"},
                    files={
                        "file": ("audio.wav", file_handle, "audio/wav"),
                    },
                    data={
                        "model": _WHISPER_MODEL,
                        "language": "en",
                        "response_format": "json",
                    },
                )
            
            # Explicitly close file handle BEFORE os.unlink
            file_handle.close()

            if response.status_code == 200:
                result = response.json()
                text = result.get("text", "").strip()
                if text:
                    print(f"[Audio] Transcribed ({len(text)} chars): {text[:100]}")
                    return text
                else:
                    print("[Audio] Empty transcription returned")
                    return ""
            else:
                print(f"[Audio] Groq API error {response.status_code}: {response.text[:200]}")
                return ""

        finally:
            os.unlink(tmp_path)

    except Exception as e:
        print(f"[Audio] Transcription error: {e}")
        return ""


def _detect_audio_format(audio_bytes: bytes) -> str:
    """Detect audio format from file header magic bytes."""
    if len(audio_bytes) < 4:
        return "wav"
    # WebM/EBML: 0x1A 0x45 0xDF 0xA3
    if audio_bytes[:4] == b'\x1a\x45\xdf\xa3':
        return "webm"
    # Ogg: 'OggS'
    if audio_bytes[:4] == b'OggS':
        return "ogg"
    # MP4/M4A: ftyp box
    if audio_bytes[4:8] == b'ftyp':
        return "m4a"
    # WAV: RIFF
    if audio_bytes[:4] == b'RIFF':
        return "wav"
    # FLAC: fLaC
    if audio_bytes[:4] == b'fLaC':
        return "flac"
    # Default fallback
    return "wav"
