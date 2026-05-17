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

# Gemma vision model (Google AI Studio)
_gemma_vision_model = None


def _get_gemma_vision_model():
    """Lazy-init Gemma vision model using google-generativeai package."""
    global _gemma_vision_model
    if _gemma_vision_model is None:
        genai.configure(api_key=os.getenv("GOOGLE_AI_STUDIO_KEY"))
        # Use Gemma 3 27B which is available via Google AI Studio / generativeai SDK
        # _gemma_vision_model = genai.GenerativeModel("gemma-3-27b-it")
        _gemma_vision_model = genai.GenerativeModel("gemma-4-26b-a4b-it")
    return _gemma_vision_model


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


def _clean_description(raw_text: str) -> str:
    """
    Clean up Gemma output to extract the actual description from chain-of-thought reasoning.
    The model often outputs reasoning, drafts, and then the final answer.
    """
    import re
    text = raw_text.strip()
    
    # STRATEGY: Extract the last meaningful sentence/quoted string since that's the final answer
    
    # 1. First, look for the last quoted string (model often puts final answer in quotes)
    all_quotes = re.findall(r'"([^"]{10,})"', text)
    if all_quotes:
        # Use the last quoted string
        candidate = all_quotes[-1].strip()
        # Verify it's not a reject phrase
        reject_phrases = ['task:', 'draft', 'constraint:', 'final check', 'alternative']
        if not any(phrase in candidate.lower() for phrase in reject_phrases):
            words = candidate.split()
            if len(words) <= 25:
                # Ensure single period at end (remove existing periods first)
                candidate = candidate.rstrip('.').strip()
                print(f"[VISION] Extracted from quotes: {candidate}")
                return candidate + '.'
    
    # 2. If no good quoted string, extract lines that look like actual descriptions
    #    (skip reasoning, drafts, numbering, asterisks)
    lines = text.split('\n')
    description_candidates = []
    
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith('*') or stripped.startswith('-'):
            continue
        
        # Skip reasoning/analysis lines
        line_lower = stripped.lower()
        skip_keywords = [
            'task:', 'constraint:', 'draft', 'final', 'check:',
            'description:', 'let', 'try:', 'count:', 'wait,',
            'alternative:', 'choice:', 'subject:', 'setting:',
            'arrangement:', 'analyze', 'examine', 'one short',
            'under 15 words', 'accurate', 'punchier'
        ]
        
        if any(kw in line_lower for kw in skip_keywords):
            continue
        
        # Remove markdown/bullet formatting
        cleaned = stripped.replace('**', '').replace('*', '').lstrip('0123456789.)').strip()
        
        # Accept lines that look like complete descriptions
        if len(cleaned) > 10 and len(cleaned.split()) < 25:
            description_candidates.append(cleaned)
    
    # 3. Use the last candidate (usually closest to final answer)
    if description_candidates:
        final_desc = description_candidates[-1]
        # Ensure single period at end (remove existing periods first)
        final_desc = final_desc.rstrip('.').strip()
        print(f"[VISION] Extracted from lines: {final_desc}")
        return final_desc + '.'
    
    # 4. Fallback: return the end of the raw text
    print(f"[VISION] Using fallback extraction")
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

async def _call_gemma_vision(data_url: str) -> str:
    """
    Call Gemma 4 (multimodal vision model) for image description.
    Uses google-generativeai package with image data URL.
    """
    import asyncio
    import io
    from PIL import Image
    import google.generativeai as genai

    api_key = os.getenv("GOOGLE_AI_STUDIO_KEY")
    if not api_key:
        print("[VISION] GOOGLE_AI_STUDIO_KEY not set")
        return "Image captured but description failed."

    try:
        # Decode base64 data URL to bytes
        b64_data = data_url.split(',', 1)[1] if ',' in data_url else data_url
        image_bytes = base64.b64decode(b64_data)

        # Convert bytes to PIL Image
        image_pil = Image.open(io.BytesIO(image_bytes))

        # Simple direct model call (no executor wrapper)
        model = _get_gemma_vision_model()
        prompt = "Describe this image in one short sentence under 15 words."
        
        response = model.generate_content(
            [prompt, image_pil],
            generation_config=genai.types.GenerationConfig(
                temperature=0.1,
                max_output_tokens=50,
            ),
        )

        if response and response.text:
            desc = response.text.strip()
            print(f"[VISION] Raw response: '{desc}'")
            if len(desc) > 5:
                return _clean_description(desc)

        print("[VISION] Model returned empty response")
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
