"""
tts.py - Text-to-Speech engine.
Converts AI response text to audio (MP3) so hardware + frontend can play it.
Uses edge-tts (Microsoft Edge free TTS) - high quality, multiple voices, no API key needed.
Shared by both in-app chat and hardware chat modules.
"""

import asyncio
import tempfile
import os

# Default voice: English female, natural-sounding for accessibility
_DEFAULT_VOICE = "en-US-JennyNeural"  # Calm, clear female voice
_FALLBACK_VOICE = "en-US-GuyNeural"   # Backup male voice


# async def text_to_speech(text: str, voice: str = None) -> bytes:
#     """
#     Convert text to MP3 audio bytes using edge-tts.
    
#     Args:
#         text: The text to speak
#         voice: The edge-tts voice name (default: en-US-JennyNeural)
        
#     Returns:
#         MP3 audio bytes, or empty bytes on failure
#     """
#     if not text or not text.strip():
#         print("[TTS] Empty text received, skipping")
#         return b""
    
#     try:
#         import edge_tts
        
#         voice = voice or _DEFAULT_VOICE
#         communicate = edge_tts.Communicate(text, voice)
        
#         # Generate to temporary file, then read back as bytes
#         with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
#             tmp_path = tmp.name
        
#         await communicate.save(tmp_path)
        
#         with open(tmp_path, "rb") as f:
#             audio_bytes = f.read()
        
#         # Clean up temp file
#         try:
#             os.unlink(tmp_path)
#         except:
#             pass
        
#         print(f"[TTS] Generated {len(audio_bytes)} bytes of audio for text ({len(text)} chars)")
#         return audio_bytes
        
#     except ImportError:
#         print("[TTS] edge-tts not installed, falling back to dummy response")
#         return b""
#     except Exception as e:
#         print(f"[TTS] Error generating speech: {e}")
#         # Retry with fallback voice if not already using it
#         if voice and voice != _FALLBACK_VOICE:
#             print(f"[TTS] Retrying with fallback voice {_FALLBACK_VOICE}...")
#             return await text_to_speech(text, _FALLBACK_VOICE)
#         return b""

async def text_to_speech(text: str, voice: str = None) -> bytes:
    """
    Convert text to MP3 audio bytes using edge-tts with timeout.
    """
    if not text or not text.strip():
        print("[TTS] Empty text received, skipping")
        return b""
    
    try:
        import edge_tts
        import asyncio
        
        voice = voice or _DEFAULT_VOICE
        communicate = edge_tts.Communicate(text, voice)
        
        # --- FIXED FOR WINDOWS FILE LOCKING ---
        tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        tmp_path = tmp.name
        tmp.close() # Release the file handle lock instantly so edge-tts can write to it!
        
        # Add timeout to edge-tts.save() to prevent hanging
        try:
            await asyncio.wait_for(communicate.save(tmp_path), timeout=15.0)
        except asyncio.TimeoutError:
            print(f"[TTS] edge-tts.save() timed out after 15s")
            # Clean up and fall back
            try:
                os.unlink(tmp_path)
            except:
                pass
            if voice and voice != _FALLBACK_VOICE:
                return await text_to_speech(text, _FALLBACK_VOICE)
            return b""
        
        with open(tmp_path, "rb") as f:
            audio_bytes = f.read()
        
        # Clean up temp file
        try:
            os.unlink(tmp_path)
        except:
            pass
        
        print(f"[TTS] Generated {len(audio_bytes)} bytes of audio for text ({len(text)} chars)")
        return audio_bytes
        
    except ImportError:
        print("[TTS] edge-tts not installed")
        return b""
    except Exception as e:
        print(f"[TTS] Error generating speech: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        if voice and voice != _FALLBACK_VOICE:
            print(f"[TTS] Retrying with fallback voice {_FALLBACK_VOICE}...")
            return await text_to_speech(text, _FALLBACK_VOICE)
        return b""


async def text_to_speech_base64(text: str, voice: str = None) -> str:
    """
    Convert text to base64-encoded MP3 audio string.
    Convenient for JSON API responses.
    
    Returns:
        Base64-encoded MP3 string, or empty string on failure
    """
    audio_bytes = await text_to_speech(text, voice)
    if audio_bytes:
        import base64
        return base64.b64encode(audio_bytes).decode("utf-8")
    return ""
