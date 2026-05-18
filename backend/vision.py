import os
import uuid
import base64
import google.generativeai as genai
from database import save_memory

# Supabase storage
from supabase import create_client
_supabase_url = os.getenv("SUPABASE_URL")
_supabase_key = os.getenv("SUPABASE_KEY")
_storage_client = create_client(_supabase_url, _supabase_key)
_STORAGE_BUCKET = "images"

# Gemma vision (Google AI Studio) — primary + fallbacks if API returns 5xx
_VISION_MODEL_IDS = [
    os.getenv("GEMMA_VISION_MODEL", "gemma-4-26b-a4b-it"),
    "gemma-3-27b-it",
]
_genai_configured = False


def _ensure_genai():
    global _genai_configured
    if not _genai_configured:
        api_key = os.getenv("GOOGLE_AI_STUDIO_KEY") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GOOGLE_AI_STUDIO_KEY or GEMINI_API_KEY is not set")
        genai.configure(api_key=api_key)
        _genai_configured = True


def _upload_image_to_storage(image_bytes: bytes, user_id: str) -> str | None:
    """Upload image bytes to Supabase Storage, return public URL."""
    try:
        file_ext = "jpg"
        file_name = f"{user_id}/{uuid.uuid4().hex}.{file_ext}"
        _storage_client.storage.from_(_STORAGE_BUCKET).upload(
            path=file_name,
            file=image_bytes,
            file_options={"content-type": "image/jpeg"},
        )
        public_url = _storage_client.storage.from_(_STORAGE_BUCKET).get_public_url(file_name)
        return public_url
    except Exception as e:
        print(f"[VISION] Storage upload failed: {e}")
        return None


def _looks_like_description(text: str) -> bool:
    """True if text looks like a short image caption, not model reasoning."""
    import re

    s = text.strip().strip('"\'').strip()
    if not s or len(s) < 12:
        return False

    words = s.split()
    if len(words) < 4 or len(words) > 20:
        return False

    lower = s.lower()

    reject_substrings = [
        "task:", "constraint:", "draft", "word count", "words)",
        "self-correction", "final choice", "final check", "let's",
        "let us", "stick to", "one short sentence", "under 15 words",
        "subject:", "setting:", "arrangement:", "image content:",
        "yes.", "no.", "good.", "too long", "punchier", "accurate",
        "try:", "wait,", "actually,", "both are good", "i'll go",
        "total:", "perfect.", "check if",
    ]
    if any(r in lower for r in reject_substrings):
        return False

    if re.search(r"\(\s*\d+\s+words?\s*\)", s, re.IGNORECASE):
        return False

    # Reasoning lines often start with bullets, numbers, or meta labels
    if re.match(r"^[\*\-\d\.\)]", s):
        return False

    # Should read like a sentence (letters/spaces/punctuation only)
    if not re.match(r"^[A-Za-z].*[.!?]?$", s):
        return False

    alpha_ratio = sum(c.isalpha() or c.isspace() for c in s) / max(len(s), 1)
    return alpha_ratio > 0.85


def _normalize_description(text: str) -> str:
    s = text.strip().strip('"\'').rstrip(".")
    s = s.replace("*", "").strip()
    if not s:
        return s
    return s + "."


def _clean_description(raw_text: str) -> str:
    """
    Extract one speakable caption from Gemma chain-of-thought output.
    Never blindly use the last quoted span — mismatched quotes capture reasoning.
    """
    import re

    text = raw_text.strip()

    # (position in text, caption) — pick the last valid match in the full response
    candidates: list[tuple[int, str]] = []

    for match in re.finditer(r'"([^"]{12,180})"', text):
        candidate = match.group(1).strip()
        if _looks_like_description(candidate):
            candidates.append((match.start(), candidate))

    line_start = 0
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            cleaned = re.sub(r"\s*[\(\-–].*$", "", stripped).strip()
            cleaned = cleaned.replace("*", "").strip().strip('"\'')
            if _looks_like_description(cleaned):
                candidates.append((line_start, cleaned))
        line_start += len(line) + 1

    tail = text[-400:] if len(text) > 400 else text
    tail_offset = len(text) - len(tail)
    for match in re.finditer(
        r"([A-Z][^.!?\n]{10,120}(?:displayed|arranged|showing|sitting|standing|holding|on|in|with|near)[^.!?\n]{0,80}[.!?])",
        tail,
    ):
        candidate = match.group(1).strip().strip('"\'')
        if _looks_like_description(candidate):
            candidates.append((tail_offset + match.start(), candidate))

    if candidates:
        candidates.sort(key=lambda x: x[0])
        best = candidates[-1][1]
        result = _normalize_description(best)
        print(f"[VISION] Extracted description: {result}")
        return result

    print("[VISION] Could not extract description from model output")
    return "Image captured. Please try again for description."


# async def _call_gemma_vision(data_url: str) -> str:
#     """
#     Call Gemma 4 (multimodal vision model) for image description.
#     Uses google-generativeai package with image data URL.
#     """
#     import asyncio
#     import io
#     from PIL import Image
#     import google.generativeai as genai

#     api_key = os.getenv("GOOGLE_AI_STUDIO_KEY")
#     if not api_key:
#         print("[VISION] GOOGLE_AI_STUDIO_KEY not set")
#         return "Image captured but description failed."

#     try:
#         model = _get_gemma_vision_model()

#         # Decode base64 data URL to bytes
#         b64_data = data_url.split(',', 1)[1] if ',' in data_url else data_url
#         image_bytes = base64.b64decode(b64_data)

#         # Convert bytes to PIL Image for reliable SDK handling
#         image_pil = Image.open(io.BytesIO(image_bytes))

#         prompt = (
#             "Describe this image in one short sentence under 15 words. "
#             "Output ONLY the description, no preamble or explanation."
#         )

#         # Use the higher-level SDK API: pass PIL Image directly
#         # This is the recommended approach for google-generativeai
#         def call_model():
#             try:
#                 response = model.generate_content(
#                     [prompt, image_pil],
#                     generation_config=genai.types.GenerationConfig(
#                         temperature=0.1,
#                         max_output_tokens=50,
#                     ),
#                     # timeout=30.0,  # 30 second timeout
#                 )
#                 return response
#             except Exception as inner_e:
#                 print(f"[VISION] Model generation exception: {inner_e}")
#                 raise
        
#         response = await asyncio.wait_for(
#             asyncio.get_event_loop().run_in_executor(None, call_model),
#             timeout=35.0  # 35 second overall timeout
#         )

#         if response and response.text:
#             desc = response.text.strip()
#             print(f"[VISION] Raw response: '{desc}'")
#             if len(desc) > 5:
#                 return _clean_description(desc)

#         print("[VISION] Gemma returned empty or short response")
#         return "Image captured but description failed."

#     except asyncio.TimeoutError:
#         print(f"[VISION] Gemma call timed out (35s)")
#         return "Image captured. Taking longer than usual."
#     except Exception as e:
#         print(f"[VISION] Gemma exception: {type(e).__name__}: {e}")
#         import traceback
#         traceback.print_exc()
#         return "Image captured but description failed."

def _prepare_image_pil(image_bytes: bytes):
    """Decode and downscale large photos to reduce Google API 500 errors."""
    import io
    from PIL import Image

    image_pil = Image.open(io.BytesIO(image_bytes))
    if image_pil.mode not in ("RGB", "L"):
        image_pil = image_pil.convert("RGB")
    max_dim = 1024
    if max(image_pil.size) > max_dim:
        image_pil.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
    return image_pil


_VISION_PROMPT = (
    "Describe this image in ONE short sentence (maximum 15 words) for a blind user "
    "who will hear it via text-to-speech.\n\n"
    "Rules:\n"
    "- Output ONLY the sentence itself\n"
    "- No reasoning, drafts, bullet points, word counts, or quotation marks\n"
    "- Start immediately with the description"
)


def _generate_vision_description(model, image_pil) -> str | None:
    import google.generativeai as genai
    from google.api_core import exceptions as google_exceptions
    import time

    last_error = None
    for attempt in range(3):
        try:
            response = model.generate_content(
                [_VISION_PROMPT, image_pil],
                generation_config=genai.types.GenerationConfig(
                    temperature=0.0,
                    max_output_tokens=40,
                ),
            )
            if response and response.text:
                desc = response.text.strip()
                print(f"[VISION] Raw response: '{desc[:200]}...'")
                if len(desc) > 5:
                    return _clean_description(desc)
            return None
        except (
            google_exceptions.InternalServerError,
            google_exceptions.ServiceUnavailable,
            google_exceptions.DeadlineExceeded,
            google_exceptions.ResourceExhausted,
        ) as e:
            last_error = e
            wait = 2 ** attempt
            print(f"[VISION] Transient error (attempt {attempt + 1}/3): {e} — retry in {wait}s")
            time.sleep(wait)
        except Exception as e:
            print(f"[VISION] Model error: {type(e).__name__}: {e}")
            raise

    if last_error:
        raise last_error
    return None


async def _call_gemma_vision(data_url: str) -> str:
    """Call Gemma multimodal vision with retries and model fallbacks."""
    import asyncio
    import io

    try:
        _ensure_genai()
    except RuntimeError as e:
        print(f"[VISION] {e}")
        return "Image captured but description failed."

    try:
        b64_data = data_url.split(",", 1)[1] if "," in data_url else data_url
        image_bytes = base64.b64decode(b64_data)
        image_pil = _prepare_image_pil(image_bytes)

        loop = asyncio.get_event_loop()
        seen_models = []

        for model_id in _VISION_MODEL_IDS:
            if not model_id or model_id in seen_models:
                continue
            seen_models.append(model_id)
            try:
                model = genai.GenerativeModel(model_id)
                print(f"[VISION] Trying model: {model_id}")
                desc = await loop.run_in_executor(
                    None, _generate_vision_description, model, image_pil
                )
                if desc:
                    return desc
            except Exception as e:
                print(f"[VISION] {model_id} failed: {type(e).__name__}: {e}")

        print("[VISION] All models failed or returned empty")
        return "Image captured but description failed."

    except Exception as e:
        print(f"[VISION] Gemma exception: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return "Image captured but description failed."


async def process_image(user_id: str, image_bytes: bytes, source: str = "phone"):
    """
    The core vision pipeline:
    1. Upload image to Supabase Storage for persistence
    2. Call Gemma 4 (multimodal vision) for description
    3. Save result to memories table with image_url
    """
    try:
        # 1. Upload to Supabase Storage so it persists across app restarts
        image_url = _upload_image_to_storage(image_bytes, user_id)

        # 2. Call Gemma 4 (multimodal vision model)
        b64_image = base64.b64encode(image_bytes).decode('utf-8')
        data_url = f"data:image/jpeg;base64,{b64_image}"
        
        description = await _call_gemma_vision(data_url)

        # 3. Save to Database with image URL
        memory_record = save_memory(
            user_id=user_id,
            source=source,
            description=description,
            objects=[],
            image_url=image_url,
        )

        return {
            "description": description,
            "objects": [],
            "memory_id": memory_record.get("id"),
            "image_url": image_url,
        }

    except Exception as e:
        print(f"VISION ERROR: {str(e)}")
        raise e
