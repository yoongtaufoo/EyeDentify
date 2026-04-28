import os
import google.generativeai as genai
from PIL import Image
import io
from database import save_memory

# Setup Google AI Studio
GOOGLE_API_KEY = os.getenv("GOOGLE_AI_STUDIO_KEY")
genai.configure(api_key=GOOGLE_API_KEY)

async def process_image(user_id: str, image_bytes: bytes, source: str = "phone"):
    """
    The core vision pipeline:
    1. Convert bytes to Image
    2. Call Gemini Pro Vision (or Gemini 1.5 Flash)
    3. Save result to Supabase 'memories' table
    """
    try:
        # 1. Prepare image for Gemini
        img = Image.open(io.BytesIO(image_bytes))
        
        # 2. Initialize the model
        model = genai.GenerativeModel('gemma-4-26b-a4b-it')
        
        prompt = (
            "You are the eyes for a blind person. Describe what is in this image "
            "concisely but with enough detail for navigation or understanding. "
            "Mention objects, colors, and spatial orientation (left/right)."
        )

        # 3. Get AI Description
        response = model.generate_content([prompt, img])
        description = response.text.strip()

        # 4. Save to Database (using your database.py function)
        # We store it as a 'memory' so the user can ask questions about it later
        memory_record = save_memory(
            user_id=user_id,
            source=source,
            description=description,
            objects=[] # You could extract specific labels here if needed
        )

        return {
            "description": description,
            "objects": [],
            "memory_id": memory_record.get("id")
        }

    except Exception as e:
        print(f"VISION ERROR: {str(e)}")
        raise e