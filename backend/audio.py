"""
audio.py - Speech-to-text processing.
Uses mesolitica/malaysian-whisper-tiny (Whisper tiny, fine-tuned for Malay/English).
Runs locally — no external API needed.
Shared by both in-app chat and hardware chat modules.
"""

import os
import base64
import tempfile
import warnings

# Lazy-load heavy ML imports only when first transcription happens
_pipeline = None
_model_id = "mesolitica/malaysian-whisper-tiny"


def _get_pipeline():
    """Load Whisper pipeline once, reuse for all subsequent calls."""
    global _pipeline
    if _pipeline is None:
        print("[Audio] Loading Whisper model (first call may take 10-30s)...")
        from transformers import AutomaticSpeechRecognitionPipeline
        from transformers import pipeline as hf_pipeline

        _pipeline = hf_pipeline(
            "automatic-speech-recognition",
            model=_model_id,
            chunk_length_s=30,
            device="cpu",  # change to "cuda" if you have GPU
            token="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"
        )
        print(f"[Audio] Whisper model loaded: {_model_id}")
    return _pipeline


async def transcribe_audio_base64(audio_b64: str) -> str:
    """
    Transcribe base64-encoded audio using local Whisper model.

    Args:
        audio_b64: Base64-encoded audio string (expo-audio records as m4a/aac)

    Returns:
        Transcribed text string, or empty string on failure
    """
    try:
        import torch

        # Decode base64 to bytes, write to temp file
        audio_bytes = base64.b64decode(audio_b64)
        with tempfile.NamedTemporaryFile(suffix=".m4a", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            pipe = _get_pipeline()

            # Suppress tokenizer warnings about sequence length
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")

                result = pipe(
                    tmp_path,
                    generate_kwargs={"language": "<|en|>", "task": "transcribe"},
                    return_timestamps=False,
                )

            text = result.get("text", "").strip()
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
