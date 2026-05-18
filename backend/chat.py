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


def _get_gemma_model():
    """Lazy-init Gemma model using google-generativeai package."""
    global _gemma_model
    if _gemma_model is None:
        import google.generativeai as genai
        genai.configure(api_key=os.getenv("GOOGLE_AI_STUDIO_KEY"))
        # Use Gemma 3 27B which is available via Google AI Studio / generativeai SDK
        _gemma_model = genai.GenerativeModel("gemma-4-26b-a4b-it")
    return _gemma_model


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

    # 6. Final cleanup
    result = text.strip()
    return result or text


def _extract_final_response(text: str) -> str:
    """
    Extract the final response from text that may contain multiple quoted
    candidate responses followed by the actual unquoted response.
    
    Strategy:
    1. Split text into quoted blocks (inside " ") and unquoted text outside.
    2. If there are quoted blocks and the last piece of unquoted text is
       substantial (>= 3 words), use it as the final response.
    3. Otherwise, fall back to the last quoted block.
    """
    import re
    
    # Find all quoted blocks and the text between/after them
    # Pattern matches quoted strings (with ASCII quotes after normalization)
    parts = re.split(r'("[^"]{10,}")', text)
    
    quoted_blocks = []
    unquoted_parts = []
    
    for i, part in enumerate(parts):
        if part.startswith('"') and part.endswith('"'):
            # Quoted block - strip the quotes
            quoted_blocks.append(part[1:-1].strip())
        else:
            # Unquoted text
            stripped = part.strip()
            if stripped:
                unquoted_parts.append(stripped)
    
    # If there are no quoted blocks, return text as-is
    if not quoted_blocks:
        return text
    
    # Get the last unquoted text (if any)
    last_unquoted = unquoted_parts[-1] if unquoted_parts else ""
    
    # Count words in the last unquoted text
    last_unquoted_words = len(last_unquoted.split()) if last_unquoted else 0
    
    # If the last unquoted text is substantial, use it as the final response
    if last_unquoted_words >= 3:
        return last_unquoted
    
    # Otherwise, use the last quoted block
    return quoted_blocks[-1]


def _call_gemma(system_prompt: str, user_content: str) -> str:
    """Call Gemma 4 with low temperature and timeout."""
    model = _get_gemma_model()
    # Combine system prompt and user content for Gemma (which doesn't have native system role)
    combined_prompt = f"{system_prompt}\n\nUser: {user_content}\n\nAssistant:"
    try:
        response = model.generate_content(
            combined_prompt,
            generation_config={
                "temperature": 0.1,
                "max_output_tokens": 150,
            },
            # timeout=20.0,  # 20 second timeout for Gemma calls
        )
        return response.text.strip()
    except Exception as e:
        print(f"[Chat] Gemma generation exception: {type(e).__name__}: {e}")
        raise


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
    for m in memories:
        ts = m.get("created_at", "")
        # Parse timestamp to readable format
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            time_str = dt.strftime("%I:%M %p")
        except:
            time_str = "unknown time"

        desc = m.get("description", "")
        objs = m.get("objects", [])
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
    for chat in recent_chats[-8:]:
        role_label = chat.get("role", "user")
        role_name = "User" if role_label == "user" else "Assistant"
        history_parts.append(f"{role_name}: {chat.get('content', '')}")
    history_context = "\n".join(history_parts) if history_parts else ""

    if history_context:
        user_prompt = (
            f"Recent conversation:\n{history_context}\n\n"
            f"User now says: {message}"
        )
    else:
        user_prompt = message

    return await _ask_llm(user_prompt)
