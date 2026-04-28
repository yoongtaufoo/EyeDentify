"""
chat.py - GLM Chatbot engine with memory awareness.
Handles all conversational logic including date-based memory queries.

SHARED by both in-app chat and hardware chat modules.
"""
import os
from datetime import datetime, timedelta
from typing import List, Optional
from openai import AsyncOpenAI

from database import get_chat_history, save_chat_message, get_memories_by_date, get_recent_memories

# GLM Client (z.ai)
ai_client = AsyncOpenAI(
    api_key=os.getenv("GLM_API_KEY"),
    base_url="https://api.z.ai/v4"
)

SYSTEM_PROMPT = """You are EyeDentify, an AI assistant for blind and visually impaired users.
You are helpful, concise, and safety-conscious. Key guidelines:

1. Always prioritize safety - warn about hazards proactively.
2. Use descriptive spatial language (left/right/near/far).
3. Be concise - screen readers will read your responses aloud.
4. When referencing memories/images the user has captured, use past tense.
5. If the user asks about what they've seen before, reference their memory logs.
6. Be warm and supportive. Your user may rely on you for independence."""


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
    
    # Use GLM to produce a natural summary/response
    response = await ai_client.chat.completions.create(
        model="glm-4",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"The user is asking about their past experiences.\n\nQuestion: {question}\n\nHere are their memory logs:\n{context}\n\nProvide a helpful, concise answer."}
        ],
        temperature=0.7,
    )
    return response.choices[0].message.content


async def _handle_image_qa(user_id: str, question: str, description: str) -> str:
    """Handle when user asks a question about the currently captured image."""
    response = await ai_client.chat.completions.create(
        model="glm-4",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"The user just took a photo and here's its AI-generated description:\n\n{description}\n\nNow the user asks: {question}\n\nAnswer based on the image description. Be helpful and descriptive."}
        ],
        temperature=0.7,
    )
    return response.choices[0].message.content


async def _handle_general_chat(user_id: str, message: str) -> str:
    """Handle general conversation not related to images or memories."""
    # Get recent chat history for context
    recent_chats = get_chat_history(user_id, limit=10)
    
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    
    # Add recent conversation for continuity
    for chat in recent_chats[-8:]:  # Last 8 messages for context
        messages.append({
            "role": chat.get("role", "user"),
            "content": chat.get("content", ""),
        })
    
    # Add current message
    messages.append({"role": "user", "content": message})
    
    response = await ai_client.chat.completions.create(
        model="glm-4",
        messages=messages,
        temperature=0.7,
    )
    return response.choices[0].message.content
