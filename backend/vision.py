import os
import uuid
import google.generativeai as genai
from PIL import Image
import io
from database import save_memory

# Setup Google AI Studio
GOOGLE_API_KEY = os.getenv("GOOGLE_AI_STUDIO_KEY")
genai.configure(api_key=GOOGLE_API_KEY)

# Supabase storage
from supabase import create_client
_supabase_url = os.getenv("SUPABASE_URL")
_supabase_key = os.getenv("SUPABASE_KEY")
_storage_client = create_client(_supabase_url, _supabase_key)
_STORAGE_BUCKET = "images"


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


async def process_image(user_id: str, image_bytes: bytes, source: str = "phone"):
    """
    The core vision pipeline:
    1. Upload image to Supabase Storage for persistence
    2. Call Gemini for description
    3. Save result to memories table with image_url
    """
    try:
        # 1. Upload to Supabase Storage so it persists across app restarts
        image_url = _upload_image_to_storage(image_bytes, user_id)

        # 2. Prepare image for Gemini
        img = Image.open(io.BytesIO(image_bytes))

        # 3. Initialize the model
        model = genai.GenerativeModel('gemma-4-26b-a4b-it')

        prompt = "Describe this image in one sentence."

        # 4. Get AI Description
        response = model.generate_content([prompt, img])
        description = response.text.strip()

        # 5. Save to Database with image URL
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