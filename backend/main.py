"""
EyeDentify Backend - FastAPI Main Entry Point
=============================================
This is the SHARED backend for both:
  - In-app chat (phone module - your responsibility)
  - Hardware chat (Pi module - teammate's responsibility)

Routes are organized by function. Shared logic lives in separate modules.
"""
import os
import uuid
import base64
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="EyeDentify API",
    description="Shared backend for EyeDentify - AI assistant for blind/visually impaired users",
    version="2.0.0",
    # Allow large base64 images from mobile cameras (default 1MB is too small)
    multipart_form_options={"max_part_size": 20 * 1024 * 1024},  # 20 MB
)

# CORS - allow frontend to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print(f"DEBUG: Validation Error at {request.url.path}")
    print(f"DEBUG: Errors: {exc.errors()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors()},
    )

# ============================================================
# HEALTH CHECK
# ============================================================


@app.get("/")
async def health():
    return {"status": "ok", "service": "EyeDentify API v2"}


# ============================================================
# AUTH ENDPOINTS (Supabase Auth proxy)
# ============================================================

# ============================================================
# AUTH ENDPOINTS (Updated for EyeDentify v2)
# ============================================================

@app.post("/auth/signup")
async def signup(
    email: str = Form(...), 
    password: str = Form(...), 
    full_name: str = Form(None),
    keyboard_type: str = Form("normal") # Added to match your database.py
):
    """Register a new user and immediately create their DB profile."""
    from database import supabase, create_profile
    
    try:
        # 1. Sign up the user in Supabase Auth
        # Note: By default, this sends a confirmation email. 
        # If you want auto-confirm, change settings in Supabase Auth provider.
        auth_response = supabase.auth.sign_up({
            "email": email,
            "password": password,
            "options": {
                "data": {
                    "full_name": full_name,
                    "keyboard_type": keyboard_type
                }
            }
        })

        if not auth_response.user:
            raise HTTPException(status_code=400, detail="Signup failed.")

        user_id = auth_response.user.id

        # 2. CREATE THE PROFILE IMMEDIATELY
        # This prevents the "Ghost User" bug where Auth exists but DB is empty.
        try:
            profile = create_profile(
                user_id=user_id, 
                full_name=full_name, 
                keyboard_type=keyboard_type
            )
            print(f"LOG: Profile created for {user_id}")
        except Exception as db_err:
            print(f"CRITICAL: Auth succeeded but Profile failed: {db_err}")
            # Optional: You could delete the auth user here to allow a retry
            # supabase.auth.admin.delete_user(user_id) 
            raise HTTPException(status_code=500, detail="Database profile creation failed.")

        return {
            "status": "success",
            "user": auth_response.user,
            "profile": profile,
            "session": auth_response.session
        }

    except Exception as e:
        print(f"[AUTH ERROR] {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
# @app.post("/auth/signup")
# async def signup(email: str = Form(...), password: str = Form(...), full_name: str = Form(None)):
#     """Register a new user via Supabase Auth."""
#     from supabase import create_client
#     auth_url = os.getenv("SUPABASE_AUTH_URL")
#     anon_key = os.getenv("SUPABASE_ANON_KEY")
    
#     # Use Supabase Auth REST API directly
#     import httpx
#     async with httpx.AsyncClient() as client:
#         resp = await client.post(
#             f"{auth_url}/auth/v1/signup",
#             json={"email": email, "password": password},
#             headers={"apikey": anon_key, "Authorization": f"Bearer {anon_key}"},
#         )
#         data = resp.json()
        
#         if resp.status_code in (200, 201):
#             # Create profile
#             from database import create_profile
#             user_id = data.get("user", {}).get("id")
#             if user_id:
#                 create_profile(user_id=user_id, full_name=full_name)
#             return {"user": data.get("user"), "session": data.get("session")}
#         else:
#             raise HTTPException(status_code=resp.status_code, detail=data)


@app.post("/auth/login")
async def login(email: str = Form(...), password: str = Form(...)):
    """Login via Supabase Auth."""
    import httpx
    auth_url = os.getenv("SUPABASE_AUTH_URL")
    anon_key = os.getenv("SUPABASE_ANON_KEY")
    
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{auth_url}/auth/v1/token?grant_type=password",
            json={"email": email, "password": password},
            headers={"apikey": anon_key, "Authorization": f"Bearer {anon_key}"},
        )
        data = resp.json()
        
        if resp.status_code == 200:
            return {"user": data.get("user"), "session": data.get("access_token")}
        else:
            raise HTTPException(status_code=resp.status_code, detail=data.get("error_description", "Login failed"))


@app.post("/auth/logout")
async def logout(request: Request):
    """Logout / revoke session."""
    # In a real app, invalidate the token server-side
    return {"status": "logged out"}


# ============================================================
# VISION ENDPOINT (shared by phone + Pi)
# POST /vision/process - upload image -> YOLO + Gemma -> save memory
# ============================================================

@app.post("/vision/process")
async def vision_process(
    user_id: str = Form(...),
    image: UploadFile = File(None),
    image_base64: str = Form(None),
    source: str = Form("phone"),  # 'phone' or 'hardware'
):
    """
    Process an uploaded image through the full vision pipeline.
    
    SHARED endpoint:
      - Phone sends source='phone'
      - Pi sends source='hardware'
      
    Accepts either:
      - image: file upload (hardware / non-ExpoGo)
      - image_base64: base64 string (Expo Go compatible)
      
    Returns: { description, objects, memory_id, image_url }
    Also saves both user capture + AI response to chat_history so images persist on restart.
    """
    try:
        # Read image from either source
        if image_base64:
            import base64 as b64mod
            image_data = b64mod.urlsafe_b64decode(image_base64)
        elif image:
            image_data = await image.read()
        else:
            raise HTTPException(status_code=400, detail="No image provided")

        from vision import process_image
        from database import save_chat_message
        
        result = await process_image(
            user_id=user_id,
            image_bytes=image_data,
            source=source,
        )

        # Save to chat_history so vision messages survive app restarts
        save_chat_message(
            user_id=user_id,
            role="user",
            content="📷 Captured an image",
            memory_id=result.get("memory_id"),
        )
        save_chat_message(
            user_id=user_id,
            role="assistant",
            content=result.get("description", "Image processed."),
            memory_id=result.get("memory_id"),
        )

        return result
    except Exception as e:
        print(f"[API] Vision error: {e}")
        raise HTTPException(status_code=500, detail=f"Vision processing failed: {str(e)}")


# ============================================================
# CHAT ENDPOINTS (shared by phone + Pi)
# POST /chat/send - send message, get AI response
# GET /chat/history - retrieve chat history
# ============================================================

@app.post("/chat/send")
async def chat_send(
    user_id: str = Form(...),
    message: str = Form(""),
    audio_base64: str = Form(None),
    current_memory_id: str = Form(None),
    current_description: str = Form(None),
):
    """
    Send a message to the chatbot.
    
    Flow:
      1. If audio provided, transcribe it first
      2. Route to memory query / image QA / general chat
      3. Return AI response text
      
    SHARED - both phone and Pi use this.
    """
    try:
        # Step 1: Transcribe audio if provided
        audio_text = None
        if audio_base64:
            from audio import transcribe_audio_base64
            audio_text = await transcribe_audio_base64(audio_base64)
            message = audio_text or ""
            if not audio_text:
                return {"response": "I couldn't understand that audio. Could you try again?"}
        
        # Step 2: Process through chat engine
        from chat import handle_chat
        response_text = await handle_chat(
            user_id=user_id,
            message=message,
            current_description=current_description,
            current_memory_id=current_memory_id,
        )
        
        return {"response": response_text, "audio_text": audio_text}
    
    except Exception as e:
        print(f"[API] Chat error: {e}")
        raise HTTPException(status_code=500, detail=f"Chat processing failed: {str(e)}")


@app.get("/chat/history")
async def chat_history(user_id: str, limit: int = 50):
    """Get chat history for a user, enriched with image URLs from memories."""
    from database import get_chat_history, get_memories_by_id_list

    history = get_chat_history(user_id, limit=limit)

    # Collect all unique memory_ids from history
    memory_ids = list(set(
        msg.get("memory_id") for msg in history if msg.get("memory_id")
    ))

    # Batch-fetch matching memories for image URLs
    memories_map = {}
    if memory_ids:
        memories = get_memories_by_id_list(memory_ids)
        memories_map = {m["id"]: m for m in memories}

    # Enrich history entries with image_url from their linked memory
    for msg in history:
        mid = msg.get("memory_id")
        if mid and mid in memories_map:
            mem = memories_map[mid]
            if mem.get("image_url"):
                msg["image_uri"] = mem["image_url"]

    return {"history": history}


# ============================================================
# COMBINED AGENT ENDPOINT (legacy compatibility + convenience)
# POST /agent/interact - handles both vision and chat in one call
# This is what the original App.js was calling.
# ============================================================

@app.post("/agent/interact")
async def interact(
    user_id: str = Form(...),
    text: str = Form(None),
    image: UploadFile = File(None),
    audio: UploadFile = File(None),
):
    """
    Combined agent endpoint - auto-detects intent based on input.
    
    If image sent: run vision pipeline, save memory, return description.
    If text/audio sent: send to chatbot, return response.
    If both: process vision first, then chat with image context.
    """
    try:
        # MODE 1: VISION ONLY (image without text/audio)
        if image and not text and not audio:
            image_data = await image.read()
            from vision import process_image
            
            result = await process_image(
                user_id=user_id,
                image_bytes=image_data,
                source="phone",
            )
            return {
                "audio_text": result["description"],
                "objects": result["objects"],
                "memory_id": result["memory_id"],
            }
        
        # MODE 2: CHAT WITH IMAGE (image + text/audio question about it)
        if image and (text or audio):
            image_data = await image.read()
            from vision import process_image
            from chat import handle_chat
            from audio import transcribe_audio
            
            # Process image first
            vision_result = await process_image(
                user_id=user_id,
                image_bytes=image_data,
                source="phone",
            )
            
            # Get question text
            question = text
            if audio and not question:
                audio_data = await audio.read()
                question = await transcribe_audio(audio_data)
            
            # Chat with image context
            response = await handle_chat(
                user_id=user_id,
                message=question or "What's in this image?",
                current_description=vision_result["description"],
                current_memory_id=vision_result["memory_id"],
            )
            
            return {
                "audio_text": response,
                "description": vision_result["description"],
                "objects": vision_result["objects"],
                "memory_id": vision_result["memory_id"],
            }
        
        # MODE 3: TEXT/AUDIO ONLY (chat without new image)
        if text or audio:
            question = text
            if audio and not question:
                audio_data = await audio.read()
                from audio import transcribe_audio
                question = await transcribe_audio(audio_data)
            
            from chat import handle_chat
            response = await handle_chat(user_id=user_id, message=question or "Hello")
            return {"audio_text": response}
        
        # MODE 4: NOTHING SENT
        return {"audio_text": "I'm listening. Point the camera and tap to identify objects."}

    except Exception as e:
        print(f"[API] Agent interact error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# HARDWARE-SPECIFIC ROUTES (for Pi / teammate)
# These endpoints are specifically designed for hardware interaction.
# ============================================================

@app.get("/hardware/pair/{pi_serial}")
async def check_pairing(pi_serial: str):
    """Check if a Pi serial is paired to any profile."""
    from database import get_profile
    from supabase import create_client
    
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    client = create_client(url, key)
    
    response = client.table("profiles").select("*").eq("pi_serial", pi_serial).execute()
    if response.data:
        return {"paired": True, "user_id": response.data[0]["id"]}
    return {"paired": False}


@app.post("/hardware/webhook")
async def hardware_webhook(
    pi_serial: str = Form(...),
    action: str = Form(...),  # 'vision', 'chat', etc.
    payload: str = Form("{}"),  # JSON payload
):
    """
    Webhook endpoint for Pi device to communicate with backend.
    Teammate's Pi code calls this endpoint.
    
    Actions:
      - vision: Process an image (payload contains image data reference)
      - chat: Send/receive chat messages  
    """
    # Verify pairing
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    from supabase import create_client
    client = create_client(url, key)
    
    pair_check = client.table("profiles").select("id").eq("pi_serial", pi_serial).execute()
    if not pair_check.data:
        raise HTTPException(status_code=404, detail="Device not paired")
    
    user_id = pair_check.data[0]["id"]
    
    import json
    data = json.loads(payload)
    
    if action == "vision":
        # Teammate sends image data, we process with shared vision pipeline
        image_b64 = data.get("image_base64", "")
        if not image_b64:
            raise HTTPException(status_code=400, detail="No image data in payload")
        
        image_bytes = base64.b64decode(image_b64)
        from vision import process_image
        result = await process_image(user_id, image_bytes, source="hardware")
        return result
    
    elif action == "chat":
        message = data.get("message", "")
        from chat import handle_chat
        response = await handle_chat(user_id, message)
        return {"response": response}
    
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {action}")


# Run with: uvicorn main:app --reload --host 0.0.0.0 --port 8000
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
