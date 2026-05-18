"""
chat.py - Gemma Chatbot engine.
Handles all conversational logic including date-based memory queries.

Uses Gemma 4 (Google AI Studio / google-generativeai) as the primary model.

SHARED by both in-app chat and hardware chat modules.
"""
import os
from datetime import datetime, timedelta
from typing import List, Optional

from database import get_chat_history, save_chat_message, get_memories_by_date, get_recent_memories

# ============================================================
# GEMMA CLIENT
# ============================================================

_gemma_model = None

# Override via .env if needed: GEMMA_CHAT_MODEL=gemma-3-27b-it
_GEMMA_MODEL_ID = os.getenv("GEMMA_CHAT_MODEL", "gemma-4-26b-a4b-it")
_MAX_HISTORY_CHARS_PER_MSG = 300


def _get_api_key() -> str:
    return os.getenv("GOOGLE_AI_STUDIO_KEY") or os.getenv("GEMINI_API_KEY") or ""


def _get_gemma_model():
    """Lazy-init Gemma model using google-generativeai package."""
    global _gemma_model
    if _gemma_model is None:
        import google.generativeai as genai
        api_key = _get_api_key()
        if not api_key:
            raise RuntimeError("GOOGLE_AI_STUDIO_KEY or GEMINI_API_KEY is not set")
        genai.configure(api_key=api_key)
        _gemma_model = genai.GenerativeModel(_GEMMA_MODEL_ID)
    return _gemma_model


def _trim_for_prompt(text: str, max_len: int = _MAX_HISTORY_CHARS_PER_MSG) -> str:
    """Keep prompts small — long vision/CoT blobs in history can break the API."""
    if not text:
        return ""
    text = " ".join(text.split())
    if len(text) <= max_len:
        return text
    return text[: max_len - 3].rstrip() + "..."


SYSTEM_PROMPT = """You are EyeDentify, an AI assistant for blind and visually impaired users.
You are helpful, concise, and safety-conscious. Key guidelines:

1. Always prioritize safety - warn about hazards proactively.
2. Use descriptive spatial language (left/right/near/far).
3. Be VERY concise - respond in 1-2 short sentences maximum. Screen readers will read your responses aloud.
4. NEVER output your reasoning, thought process, or internal monologue. Output ONLY the final user-facing response.
5. Do NOT use bullet points, numbered lists, or options like "Option 1/Option 2". Just answer directly.
6. When referencing memories/images the user has captured, use past tense.
7. If the user asks about what they've seen before, reference their memory logs.
8. Be warm and supportive. Your user may rely on you for independence."""


def _strip_reasoning(text: str) -> str:
    """Remove leaked chain-of-thought / reasoning / inline templates from model output."""
    import re
    if not text:
        return text

    # 0. Normalize Unicode curly/smart quotes to ASCII quotes
    #    Gemma sometimes outputs curly quotes (" " ' ') which don't match
    #    the ASCII quote patterns in our regexes, causing the regex to
    #    skip past the first character and match the apostrophe in "I'm" instead.
    text = text.replace('\u201c', '"').replace('\u201d', '"')  # " " -> " "
    text = text.replace('\u2018', "'").replace('\u2019', "'")  # ' ' -> ' '

    # 1. Strip standard XML thinking blocks
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)

    # 2. AGGRESSIVE removal of self-check reasoning patterns like "No lists? Yes." or "Warm/supportive? Yes."
    #    These can span multiple lines with indentation
    # Match: Word(s) ? Yes/No . [optional whitespace/newlines] [rest of text]
    # Note: [A-Za-z/\s] allows slashes (e.g., "Warm/supportive? Yes.")
    match = re.match(
        r'^["\']?[A-Z][A-Za-z/\s]+\?["\']?\s+(Yes|No)[.?]?\s*[\n\s]*(.+)',
        text,
        re.IGNORECASE | re.DOTALL
    )
    if match:
        text = match.group(2).strip()

    # 3. Remove parenthetical commentary (model's internal monologue)
    #    e.g., "(Wait, the previous response was almost identical. I'll vary it slightly...)"
    text = re.sub(r'\([^)]*\)', '', text)

    # 4. Handle quoted+unquoted duplication.
    #    The model sometimes outputs multiple quoted candidate responses followed by
    #    the final unquoted response. The quoted and unquoted versions may differ
    #    slightly (e.g., "thank you!" vs "thank you for asking!"), so exact
    #    backreference matching fails. Strategy:
    #    - Remove all quoted blocks (they are candidate responses being considered)
    #    - Keep only the last unquoted sentence/paragraph as the final response
    #    - If the last unquoted text is very short, fall back to the last quoted block
    text = _extract_final_response(text)

    # 5. Remove leading asterisks/bullets
    if text.strip().startswith('*'):
        parts = text.split('*')
        text = parts[-1].strip()

    # 6. Remove duplicated sentence echoes and stray quotes
    result = _dedupe_repeated_reply(text.strip())
    return result or text


def _normalize_reply(s: str) -> str:
    """Lowercase alnum-only key for fuzzy duplicate detection."""
    import re
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def _dedupe_repeated_reply(text: str) -> str:
    """
    Gemma often echoes the same sentence twice, e.g.:
      Hello! ... need." Hello! ... need.
      "Hello! ... need." Hello! ... need.
    """
    import re

    text = re.sub(r"\s+", " ", text.strip())
    if not text:
        return text

    # Back-to-back duplicate (optional quote/punctuation between copies)
    dup = re.match(
        r'^(.+?)(?:["\'])?[.!?]?\s+\1["\']?[.!?]?\s*$',
        text,
        re.IGNORECASE | re.DOTALL,
    )
    if dup:
        s = dup.group(1).strip().strip("\"'")
        if s and not s[-1] in ".!?":
            s += "."
        return s

    # Quoted copy then unquoted copy (or vice versa)
    parts = re.split(r'("[^"]{8,}")', text)
    quoted = []
    unquoted = []
    for part in parts:
        if part.startswith('"') and part.endswith('"'):
            quoted.append(part[1:-1].strip())
        elif part.strip():
            unquoted.append(part.strip())

    candidates = []
    if quoted:
        candidates.append(quoted[-1])
    if unquoted:
        candidates.append(unquoted[-1])

    if len(candidates) >= 2:
        if _normalize_reply(candidates[0]) == _normalize_reply(candidates[1]):
            return candidates[-1]
        # One may be substring of the other
        a, b = _normalize_reply(candidates[0]), _normalize_reply(candidates[1])
        if a and b and (a in b or b in a):
            return candidates[0] if len(candidates[0]) >= len(candidates[1]) else candidates[1]

    if len(candidates) == 1:
        return candidates[0]

    return text.strip().strip("\"'")


def _extract_final_response(text: str) -> str:
    """Pick one speakable reply from quoted/unquoted Gemma output."""
    import re

    parts = re.split(r'("[^"]{8,}")', text)
    quoted_blocks = []
    unquoted_parts = []

    for part in parts:
        if part.startswith('"') and part.endswith('"'):
            quoted_blocks.append(part[1:-1].strip())
        elif part.strip():
            unquoted_parts.append(part.strip())

    if not quoted_blocks and not unquoted_parts:
        return _dedupe_repeated_reply(text)

    last_quoted = quoted_blocks[-1] if quoted_blocks else ""
    last_unquoted = unquoted_parts[-1] if unquoted_parts else ""

    if last_quoted and last_unquoted:
        if _normalize_reply(last_quoted) == _normalize_reply(last_unquoted):
            return last_unquoted
        if len(last_unquoted.split()) >= 3:
            return last_unquoted
        return last_quoted

    if last_unquoted:
        return last_unquoted
    if last_quoted:
        return last_quoted

    return _dedupe_repeated_reply(text)


def _call_gemma(system_prompt: str, user_content: str) -> str:
    """Call Gemma with retries on transient Google 5xx errors."""
    import time
    from google.api_core import exceptions as google_exceptions

    model = _get_gemma_model()
    user_content = _trim_for_prompt(user_content, max_len=4000)
    combined_prompt = f"{system_prompt}\n\nUser: {user_content}\n\nAssistant:"

    last_error = None
    for attempt in range(3):
        try:
            response = model.generate_content(
                combined_prompt,
                generation_config={
                    "temperature": 0.1,
                    "max_output_tokens": 150,
                },
            )
            return response.text.strip()
        except (
            google_exceptions.InternalServerError,
            google_exceptions.ServiceUnavailable,
            google_exceptions.DeadlineExceeded,
            google_exceptions.ResourceExhausted,
        ) as e:
            last_error = e
            wait = 2 ** attempt
            print(
                f"[Chat] Gemma transient error (attempt {attempt + 1}/3): "
                f"{type(e).__name__}: {e} — retrying in {wait}s"
            )
            time.sleep(wait)
        except Exception as e:
            print(f"[Chat] Gemma generation exception: {type(e).__name__}: {e}")
            raise

    print(f"[Chat] Gemma failed after retries: {type(last_error).__name__}: {last_error}")
    raise last_error


async def _ask_llm(user_prompt: str, system_prompt_override: str = None) -> str:
    """
    Call Gemma LLM with timeout.
    1. Call Gemma 4
    2. Strip any leaked reasoning from output
    """
    import asyncio
    sys = system_prompt_override or SYSTEM_PROMPT
    try:
        loop = asyncio.get_event_loop()
        raw = await asyncio.wait_for(
            loop.run_in_executor(None, _call_gemma, sys, user_prompt),
            timeout=25.0  # 25 second timeout for executor
        )
        return _strip_reasoning(raw)
    except asyncio.TimeoutError:
        print(f"[Chat] Gemma call timed out (25s)")
        return "I'm taking longer than usual to think. Could you try again?"
    except Exception as e:
        print(f"[Chat] Gemma error: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return "I'm having trouble connecting right now. Please try again in a moment."


def _is_memory_query(text: str) -> bool:
    """
    Detect if the user is asking about past memories/dates.
    Examples: "what did I see today", "summarize yesterday", "last Monday"
    """
    memory_keywords = [
        "today", "yesterday", "last", "this morning", "this afternoon",
        "this evening", "earlier", "recently", "seen", "saw", "visited",
        "summarize", "summary", "recall", "remember", "history",
        "did i", "have i", "what did", "where did", "who did"
    ]
    text_lower = text.lower()
    return any(kw in text_lower for kw in memory_keywords)


def _parse_time_range(text: str) -> tuple:
    """
    Parse natural language time references into query parameters.
    Returns (date_str, days_back) tuple - one will be None.
    """
    text_lower = text.lower()
    
    # Today
    if "today" in text_lower:
        return (None, 0)  # 0 days back = today
    # Yesterday
    elif "yesterday" in text_lower:
        return (None, 1)
    # Day-of-week patterns
    weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    for i, day in enumerate(weekdays):
        if day in text_lower:
            # Find the most recent occurrence of this weekday
            today = datetime.now()
            days_since = (today.weekday() - i) % 7
            if days_since == 0:
                days_since = 7  # If same day, go back one week for "last X"
            return (None, days_since)
    # "Last N days/weeks"
    if "last week" in text_lower:
        return (None, 7)
    if "few days" in text_lower:
        return (None, 3)
    
    return (None, 1)  # Default to yesterday


async def handle_chat(
    user_id: str,
    message: str,
    current_description: str = None,
    current_memory_id: str = None,
) -> str:
    """
    Main chat handler. Routes between memory queries and general conversation.
    
    Args:
        user_id: User UUID
        message: User's transcribed text or typed message
        current_description: (Optional) Current image description if user just took a photo
        current_memory_id: (Optional) Memory record ID for the current image
        
    Returns:
        Assistant's response text
    """
    # Save user message to chat history
    save_chat_message(user_id=user_id, role="user", content=message, 
                      memory_id=current_memory_id)
    
    # Check if this is a memory/history query
    if _is_memory_query(message):
        response = await _handle_memory_response(user_id, message)
    elif current_description:
        # User is asking about the current image they just captured
        response = await _handle_image_qa(user_id, message, current_description)
    else:
        # General conversation
        response = await _handle_general_chat(user_id, message)
    
    # Save assistant response to chat history
    save_chat_message(user_id=user_id, role="assistant", content=response,
                      memory_id=current_memory_id)
    
    return response


async def _handle_memory_response(user_id: str, question: str) -> str:
    """Handle questions about past memories (dates, summaries, etc.)."""
    date_str, days_back = _parse_time_range(question)
    memories = get_memories_by_date(user_id, date_str=date_str, days_back=days_back)

    if not memories:
        # Check if we have ANY memories at all
        all_mems = get_recent_memories(user_id, limit=1)
        if not all_mems:
            return "You don't have any memories recorded yet. Take some photos to build your visual diary!"

        time_label = "that time period" if days_back else "today"
        return f"I don't have any memories from {time_label}. Would you like me to check a different date?"

    # Build context from memories
    memory_texts = []
    import json

    for m in memories:
        if not isinstance(m, dict):
            continue
        ts = m.get("created_at", "")
        # Parse timestamp to readable format
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            time_str = dt.strftime("%I:%M %p")
        except Exception:
            time_str = "unknown time"

        desc = m.get("description", "")
        objs = m.get("objects") or []
        if isinstance(objs, str):
            try:
                objs = json.loads(objs)
            except json.JSONDecodeError:
                objs = []
        if not isinstance(objs, list):
            objs = []
        obj_labels = [o.get("label", "") for o in objs if isinstance(o, dict)]
        obj_str = f" Objects: {', '.join(obj_labels)}" if obj_labels else ""
        memory_texts.append(f"[{time_str}] {desc}{obj_str}")

    context = "\n".join(memory_texts)

    user_prompt = (
        f"The user is asking about their past experiences.\n\n"
        f"Question: {question}\n\n"
        f"Here are their memory logs:\n{context}\n\n"
        f"Provide a helpful, concise answer."
    )
    return await _ask_llm(user_prompt)


async def _handle_image_qa(user_id: str, question: str, description: str) -> str:
    """Handle when user asks a question about the currently captured image."""
    user_prompt = (
        f"The user just took a photo and here's its AI-generated description:\n\n"
        f"{description}\n\n"
        f"Now the user asks: {question}\n\n"
        f"Answer based on the image description. Be helpful and descriptive."
    )
    return await _ask_llm(user_prompt)


async def _handle_general_chat(user_id: str, message: str) -> str:
    """Handle general conversation not related to images or memories."""
    # Get recent chat history for context
    recent_chats = get_chat_history(user_id, limit=10)

    # Build conversation history as a single prompt
    history_parts = []
    for chat in recent_chats[-6:]:  # slice, not [-6] — iterating a dict loops keys (str)
        if not isinstance(chat, dict):
            continue
        role_label = chat.get("role", "user")
        role_name = "User" if role_label == "user" else "Assistant"
        content = _trim_for_prompt(str(chat.get("content") or ""))
        history_parts.append(f"{role_name}: {content}")
    history_context = "\n".join(history_parts) if history_parts else ""

    if history_context:
        user_prompt = (
            f"Recent conversation:\n{history_context}\n\n"
            f"User now says: {message}"
        )
    else:
        user_prompt = message

    return await _ask_llm(user_prompt)
