# EyeDentify - AI Vision Assistant for Blind/Visually Impaired Users
## In-App Chat Module

### Project Structure

```
EyeDentify/
├── frontend/                    # React Native (Expo) app - IN-APP CHAT (you)
│   ├── App.js                   # Root component + Navigation
│   ├── .env                     # Environment config
│   ├── package.json             # Dependencies
│   ├── babel.config.js          # Babel config for Reanimated
│   └── src/
│       ├── contexts/
│       │   └── AuthContext.js    # Supabase auth state management
│       ├── lib/
│       │   └── supabaseClient.js # Supabase client init with SecureStore
│       ├── screens/
│       │   ├── LoginScreen.js    # Login page (full accessibility)
│       │   ├── RegisterScreen.js # Registration page (full accessibility)
│       │   └── ChatScreen.js     # Main chat interface with camera + audio
│       └── services/
│           └── apiService.js     # All API calls to backend
│
├── backend/                      # FastAPI server - SHARED (you + teammate)
│   ├── main.py                  # Entry point, all API routes
│   ├── .env                     # Environment config
│   ├── requirements.txt         # Python dependencies
│   ├── database.py              # SHARED: DB operations (profiles, memories, chat_history)
│   ├── vision.py                # SHARED: YOLO object detection + Gemma description
│   ├── chat.py                  # SHARED: GLM chatbot with memory-awareness
│   └── audio.py                 # SHARED: Speech-to-text transcription
│
└── README.md                    # This file
```

### The Flow
1. **User opens app** → Login/Register screen (with full screen reader support)
2. **Main Chat Screen** → Camera always visible in background
3. **Tap SCAN** → Capture image → YOLO detects objects → Gemma describes it → Saves to memories → Speaks aloud
4. **Hold RECORD** → Record voice question about the image (or anything) → GLM answers with context
5. **Type text** → Send typed message to GLM chatbot
6. **Logout** → Back to login screen

### Accessibility Features
- All elements have `accessible`, `accessibilityLabel`, `accessibilityHint`
- Screen reader announcements on every action via `expo-speech`
- Haptic feedback on button presses (`expo-haptics`)
- High contrast UI (dark theme, clear text colors)
- Voice-first interaction model (record and speak)

### For Your Teammate (Hardware/ Pi Module)

#### Shared Backend Functions (they can import these):
```python
from vision import process_image        # Process any image bytes -> {description, objects, memory_id}
from vision import detect_objects       # YOLO detection only
from vision import describe_image       # Gemma description only
from chat import handle_chat            # Send message to GLM chatbot
from audio import transcribe_audio      # Speech-to-text
from database import save_memory        # Save memory record
from database import save_chat_message  # Save chat message
from database import get_memories_by_date  # Query memories by date
from database import get_chat_history   # Get conversation history
```

#### Hardware-Specific Endpoints (for their Pi code):
```
GET  /hardware/pair/{pi_serial}           - Check device pairing status
POST /hardware/webhook                    - Receive data from Pi device
  Body: pi_serial, action ("vision" | "chat"), payload (JSON string)
```

### Setup Instructions

#### Frontend:
```bash
cd frontend
npm install
npx expo start
```

#### Backend:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Black Screen Fix
The original black screen was caused by rendering CameraView directly at root level without proper navigation setup.
The fix: Wrapped everything in `NavigationContainer` + `Stack.Navigator` with auth-based routing.

### Tech Stack
- **Frontend**: React Native (Expo SDK 54), React Navigation v7
- **Backend**: Python FastAPI
- **Auth**: Supabase Auth
- **Database**: Supabase PostgreSQL (with pgvector)
- **Chatbot AI**: GLM-4 (via z.ai OpenAI-compatible API)
- **Vision Description**: Google Gemini 2.0 Flash (Gemma family)
- **Object Detection**: YOLOv8 (ultralytics)
- **Speech-to-Text**: Whisper-compatible API
