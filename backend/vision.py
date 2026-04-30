import os
import uuid
import base64
import httpx
from database import save_memory

# Supabase storage
from supabase import create_client
_supabase_url = os.getenv("SUPABASE_URL")
_supabase_key = os.getenv("SUPABASE_KEY")
_storage_client = create_client(_supabase_url, _supabase_key)
_STORAGE_BUCKET = "images"

# Groq Llama 4 Scout — multimodal vision model (uses existing GROQ_API_KEY)
_GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
_GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
_GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")


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
    Clean up Gemini output to enforce short, clean descriptions.
    Removes chain-of-thought, markdown formatting, role-echoing, and truncates if needed.
    """
    text = raw_text.strip()
    
    # 1. Reject role-echoing / task-echoing garbage
    reject_phrases = [
        'user role', 'system role', 'assistant role', 'you are an',
        'accessibility assistant for', 'role:', 'as an ai',
        'task:', 'describe this image', 'describe the image',
        'output only', 
        # 'max 12 words', 'one short sentence',
        'example outputs',
    ]
    lower = text.lower()
    if any(phrase in lower for phrase in reject_phrases):
        # Try to find actual description after the garbage
        for separator in ['. ', '? ', '! ']:
            if separator in text:
                after = text.split(separator, 1)[-1].strip()
                if len(after) > 10 and not any(p in after.lower() for p in reject_phrases):
                    text = after
                    break
        else:
            # Nothing salvageable — return fallback
            return "Image captured. Please try again for description."
    
    # 2. Remove numbered/bulleted list prefixes (chain-of-thought artifacts)
    lines = text.split('\n')
    cleaned_lines = []
    for line in lines:
        stripped = line.strip()
        # Skip obvious reasoning/analysis lines
        line_lower = stripped.lower()
        if any(kw in line_lower for kw in [
            'analyze', 'examine', 'draft', 'refine', 'select',
            'main subject', 'secondary subject', 'foreground', 'background',
            'composition', 'feeling', 'check:', 'choice:', 'final',
            '**step', '**task', '# ', '* *'
        ]):
            continue
        # Remove markdown bold markers
        cleaned_lines.append(stripped.replace('**', '').replace('*', ''))
    
    text = ' '.join(cleaned_lines)
    
    # 3. If still has multiple sentences, take only the first meaningful one
    import re
    sentences = re.split(r'[.!?]+', text)
    for s in sentences:
        s = s.strip()
        if len(s) > 10 and not s.startswith('(') and not s.lower().startswith('describe'):
            text = s.rstrip('.') + '.'
            break
    else:
        # Fallback: just truncate
        text = raw_text.strip()[:120].rstrip('.') + '.'
    
    # 4. Hard cap at 25 words (safety net)
    words = text.split()
    if len(words) > 25:
        text = ' '.join(words[:25]).rstrip(',') + '.'
    
    print(f"[VISION] Description ({len(text)} chars): {text}")
    return text





async def _call_groq_vision(data_url: str) -> str:
    """
    Call Groq Llama 4 Scout (multimodal vision model) for image description.
    OpenAI-compatible chat/completions format with image_url content.
    """
    import asyncio

    if not _GROQ_API_KEY:
        print("[VISION] GROQ_API_KEY not set")
        return "Image captured but description failed."

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {_GROQ_API_KEY}",
    }

    payload = {
        "model": _GROQ_VISION_MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {
                        "type": "text",
                        "text": (
                            "Describe this image in one short sentence under 15 words. "
                            "Output ONLY the description, no preamble or explanation."
                        ),
                    },
                ],
            }
        ],
        "max_tokens": 50,
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(_GROQ_URL, json=payload, headers=headers)

        if response.status_code == 200:
            desc = _extract_chat_response(response.json())
            if desc and len(desc.strip()) > 5:
                return _clean_description(desc)
            print("[VISION] Groq returned empty/short, retrying...")
            async with httpx.AsyncClient(timeout=30.0) as c2:
                r2 = await c2.post(_GROQ_URL, json=payload, headers=headers)
            if r2.status_code == 200:
                desc = _extract_chat_response(r2.json())
                if desc and len(desc.strip()) > 5:
                    return _clean_description(desc)

        elif response.status_code == 429:
            print("[VISION] Groq rate limited, waiting 5s...")
            await asyncio.sleep(5)
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(_GROQ_URL, json=payload, headers=headers)
            if resp.status_code == 200:
                desc = _extract_chat_response(resp.json())
                if desc and len(desc.strip()) > 5:
                    return _clean_description(desc)

        else:
            print(f"[VISION] Groq error {response.status_code}: {response.text[:250]}")

    except Exception as e:
        print(f"[VISION] Groq exception: {e}")

    return "Image captured but description failed."


def _extract_chat_response(data: dict | list) -> str:
    """Extract text from OpenAI-compatible chat/completions response."""
    if isinstance(data, dict):
        choices = data.get("choices", [])
        if choices and isinstance(choices, list):
            return choices[0].get("message", {}).get("content", "")
    return ""




async def process_image(user_id: str, image_bytes: bytes, source: str = "phone"):
    """
    The core vision pipeline:
    1. Upload image to Supabase Storage for persistence
    2. Call Groq Llama 4 Scout (multimodal vision) for description
    3. Save result to memories table with image_url
    """
    try:
        # 1. Upload to Supabase Storage so it persists across app restarts
        image_url = _upload_image_to_storage(image_bytes, user_id)

        # 2. Call Groq Llama 4 Scout (multimodal vision model)
        b64_image = base64.b64encode(image_bytes).decode('utf-8')
        data_url = f"data:image/jpeg;base64,{b64_image}"
        
        description = await _call_groq_vision(data_url)

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