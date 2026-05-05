"""
database.py - Shared Supabase database operations.
Used by both in-app chat (phone) and hardware chat (Pi) modules.
"""
import os
from typing import Optional
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# Initialize Supabase client
_url = os.getenv("SUPABASE_URL")
_key = os.getenv("SUPABASE_KEY")
if not _url or not _key:
    raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set in .env")

supabase = create_client(_url, _key)


# ============================================================
# PROFILE OPERATIONS
# ============================================================

def get_profile(user_id: str) -> Optional[dict]:
    """Get a user's profile by ID."""
    response = supabase.table("profiles").select("*").eq("id", user_id).execute()
    return response.data[0] if response.data else None


# def create_profile(user_id: str, full_name: str = None, pi_serial: str = None) -> dict:
#     """Create a new profile. Called after Supabase Auth signup."""
#     data = {"id": user_id}
#     if full_name:
#         data["full_name"] = full_name
#     if pi_serial:
#         data["pi_serial"] = pi_serial
#     response = supabase.table("profiles").insert(data).execute()
#     return response.data[0]

def create_profile(user_id: str, full_name: str = None, pi_serial: str = None, keyboard_type: str = "normal", password: str = None) -> dict:
    """Create/update profile including the real password (plain text in DB)."""
    data = {"id": user_id}
    if full_name: data["full_name"] = full_name
    if pi_serial: data["pi_serial"] = pi_serial
    if keyboard_type: data["keyboard_type"] = keyboard_type
    if password: data["password"] = password  # Store real password in DB

    print(f"[DEBUG] Upserting profile for user {user_id} with data: {data}")
    try:
        response = supabase.table("profiles").upsert(data).execute()
        if not response.data:
            print(f"[ERROR] Profile creation failed: No data returned")
            raise Exception(f"Profile creation failed")
        print(f"[DEBUG] Profile created/updated successfully: {response.data[0]}")
        return response.data[0]
    except Exception as e:
        print(f"[EXCEPTION] Error in create_profile: {e}")
        raise


def get_auth_user(user_id: str) -> Optional[dict]:
    """Get user data from Supabase Auth table (requires service role key)."""
    try:
        # This requires service role key and appropriate permissions
        auth_user = supabase.auth.admin.get_user_by_id(user_id)
        return auth_user.user if auth_user and auth_user.user else None
    except Exception as e:
        print(f"[WARNING] Could not fetch auth user {user_id}: {e}")
        return None

def get_or_create_profile(user_id: str, email: str = None) -> dict:
    """Gets the profile. If it doesn't exist, it creates one on the fly."""
    profile = get_profile(user_id)
    
    if not profile:
        print(f"LOG: Ghost User detected for {user_id}. Creating profile now...")
        # Fallback: Create a profile with default values if it's missing
        new_data = {
            "id": user_id,
            "full_name": email.split('@')[0] if email else "User",
        }
        try:
            response = supabase.table("profiles").insert(new_data).execute()
            return response.data[0]
        except Exception as e:
            print(f"[ERROR] Failed to create profile in database: {e}")
            # If profile creation fails, try to get data from auth user
            auth_user = get_auth_user(user_id)
            if auth_user:
                print(f"[FALLBACK] Using auth user data for {user_id}")
                # Supabase auth returns a User object (not dict), access via attribute
                meta = getattr(auth_user, 'user_metadata', None) or {}
                if isinstance(meta, dict):
                    name_from_meta = meta.get('full_name')
                else:
                    try:
                        name_from_meta = dict(meta).get('full_name') if hasattr(meta, '__iter__') else None
                    except (TypeError, ValueError):
                        name_from_meta = None
                
                return {
                    "id": user_id,
                    "full_name": name_from_meta or getattr(auth_user, 'email', '') or email.split('@')[0] if email else "User",
                }
            else:
                # Ultimate fallback: return minimal profile
                print(f"[CRITICAL] No auth user found, returning minimal profile for {user_id}")
                return {
                    "id": user_id,
                    "full_name": email.split('@')[0] if email else "User",
                }
    
    return profile


def link_pi_serial(user_id: str, pi_serial: str) -> bool:
    """Link a Pi serial number to a profile (hardware pairing)."""
    response = supabase.table("profiles").update({"pi_serial": pi_serial}).eq("id", user_id).execute()
    return len(response.data) > 0


# ============================================================
# MEMORY OPERATIONS (shared by phone + Pi)
# ============================================================

def save_memory(
    user_id: str,
    source: str,  # 'phone' or 'hardware'
    description: str,
    objects: list = None,
    image_url: str = None,
    embedding: list = None,
) -> dict:
    """
    Save a memory record to the database.
    This is a SHARED function - both phone app and Pi device call this.
    """
    # FIX: Ensure profile exists before saving memory to avoid FK error
    get_or_create_profile(user_id)

    data = {
        "user_id": user_id,
        "source": source,
        "description": description,
        "objects": objects or [],
    }
    if image_url:
        data["image_url"] = image_url
    if embedding:
        data["embedding"] = embedding

    try:
        response = supabase.table("memories").insert(data).execute()
        if not response.data:
            raise Exception("No data returned from memory insert")
        return response.data[0]
    except Exception as e:
        print(f"[DATABASE ERROR] save_memory failed: {e}")
        # Return a mock record so the app doesn't crash, but log the error
        return {"id": "error", "description": description}



def get_memories_by_date(user_id: str, date_str: str = None, days_back: int = None) -> list:
    """
    Get memories for a specific date or date range.
    Used for "what did I see today/yesterday/last Monday" queries.
    
    Args:
        user_id: The user's UUID
        date_str: ISO date string like '2026-04-27' (optional)
        days_back: Number of days to look back, e.g. 1=yesterday, 7=last week (optional)
    """
    from datetime import datetime, timedelta
    
    if days_back is not None:
        threshold = (datetime.now() - timedelta(days=days_back)).isoformat()
        response = (
            supabase.table("memories")
            .select("*")
            .eq("user_id", user_id)
            .gte("created_at", threshold)
            .order("created_at", desc=True)
            .execute()
        )
    elif date_str:
        # Query for a specific date
        start = f"{date_str}T00:00:00"
        end = f"{date_str}T23:59:59"
        response = (
            supabase.table("memories")
            .select("*")
            .eq("user_id", user_id)
            .gte("created_at", start)
            .lte("created_at", end)
            .order("created_at", desc=True)
            .execute()
        )
    else:
        # Today's memories
        today = datetime.now().strftime("%Y-%m-%d")
        start = f"{today}T00:00:00"
        response = (
            supabase.table("memories")
            .select("*")
            .eq("user_id", user_id)
            .gte("created_at", start)
            .order("created_at", desc=True)
            .execute()
        )

    return response.data or []


def get_recent_memories(user_id: str, limit: int = 20) -> list:
    """Get the most recent N memories for a user."""
    response = (
        supabase.table("memories")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return response.data or []


def get_memories_by_id_list(memory_ids: list) -> list:
    """Batch-fetch memories by a list of IDs. Used to enrich chat history with image URLs."""
    if not memory_ids:
        return []
    # Supabase PostgREST supports IN filter with comma-separated values
    response = (
        supabase.table("memories")
        .select("*")
        .in_("id", memory_ids)
        .execute()
    )
    data = response.data if response.data else []
    # Normalize to plain dicts
    result = []
    for item in data:
        if isinstance(item, dict):
            result.append(item)
        elif hasattr(item, '__dict__'):
            result.append(dict(item.__dict__))
        elif hasattr(item, 'model_dump'):
            result.append(item.model_dump())
        else:
            try:
                result.append(dict(item))
            except (TypeError, ValueError):
                result.append({"id": str(item)})
    return result


# ============================================================
# CHAT HISTORY OPERATIONS (shared by phone + Pi)
# ============================================================

def save_chat_message(
    user_id: str,
    role: str,  # 'user' or 'assistant'
    content: str,
    memory_id: str = None,
) -> dict:
    """
    Save a chat message to history.
    SHARED - both in-app and device chat use this.
    """
    # Ensure profile exists to satisfy FK constraint
    get_or_create_profile(user_id)

    data = {
        "user_id": user_id,
        "role": role,
        "content": content,
    }
    if memory_id:
        data["memory_id"] = memory_id

    response = supabase.table("chat_history").insert(data).execute()
    return response.data[0]


# def get_chat_history(user_id: str, limit: int = 50) -> list:
#     """Get chat history for a user, most recent first."""
#     response = (
#         supabase.table("chat_history")
#         .select("*")
#         .eq("user_id", user_id)
#         .order("created_at", desc=True)
#         .limit(limit)
#         .execute()
#     )
#     # Return in chronological order (oldest first for display)
#     return list(reversed(response.data or []))

def get_chat_history(user_id: str, limit: int = 50) -> list:
    """Fix: Handle empty history safely to prevent JSON Parse Error."""
    try:
        print(f"DEBUG: Fetching history for UUID: {user_id}")
        response = (
            supabase.table("chat_history")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        data = response.data if response.data else []
        # Ensure every item is a plain dict (Supabase may return model objects)
        result = []
        for item in data:
            if isinstance(item, dict):
                result.append(item)
            elif hasattr(item, '__dict__'):
                result.append(dict(item.__dict__))
            elif hasattr(item, 'model_dump'):  # Pydantic
                result.append(item.model_dump())
            else:
                try:
                    result.append(dict(item))
                except (TypeError, ValueError):
                    result.append({"role": "unknown", "content": str(item)})
        return list(reversed(result))
    except Exception as e:
        # This prevents the 500 error that crashes the frontend
        print(f"DATABASE CRASH: {str(e)}")
        return []
    # response = (
    #     supabase.table("chat_history")
    #     .select("*")
    #     .eq("user_id", user_id)
    #     .order("created_at", desc=True)
    #     .limit(limit)
    #     .execute()
    # )
    # # Ensure we return a list, even if empty, before reversing
    # data = response.data if response.data else []
    # return list(reversed(data))
