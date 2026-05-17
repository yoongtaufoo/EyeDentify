# EyeDentify - AI Vision Assistant for Blind/Visually Impaired Users

An AI-powered vision assistant that helps blind and visually impaired users understand their surroundings through voice, text, and haptic feedback. The system supports **mobile (React Native/Expo)**, **web (Vite + React)**, and **hardware (ESP32-S3 camera)** frontends, all powered by a shared **Python FastAPI** backend.

---

## Project Structure

```
EyeDentify/
├── frontend/                        # React Native (Expo SDK 54) mobile app
│   ├── App.js                       # Root component + Bottom Tab Navigator
│   ├── .env                         # Environment config
│   ├── package.json                 # Dependencies
│   ├── app.json                     # Expo config
│   ├── babel.config.js              # Babel config
│   └── src/
│       ├── contexts/
│       │   └── AuthContext.js        # Supabase auth state management
│       ├── lib/
│       │   └── supabaseClient.js     # Supabase client init
│       ├── screens/
│       │   ├── LoginScreen.js        # Login page (full accessibility)
│       │   ├── RegisterScreen.js     # Registration page (full accessibility)
│       │   ├── HomeScreen.js         # Dashboard with stats & quick actions
│       │   ├── ChatScreen.js         # Main chat + camera + voice recording
│       │   └── MemoriesScreen.js     # Saved memories grid (2-column)
│       ├── services/
│       │   └── apiService.js         # All API calls to backend
│       ├── components/
│       │   └── BrailleInput.js       # Braille keyboard input panel
│       └── utils/
│           └── audioHandler.js       # Audio recording utilities
│
├── web/                              # Web frontend (Vite + React)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx                   # Router + ProtectedRoute guards
│       ├── main.jsx                  # Entry point
│       ├── contexts/
│       │   └── AuthContext.jsx
│       ├── lib/
│       │   └── supabaseClient.js
│       ├── screens/
│       │   ├── LoginScreen.jsx
│       │   ├── RegisterScreen.jsx
│       │   ├── MainLayout.jsx
│       │   ├── HomeScreen.jsx        # Dashboard with stats
│       │   ├── ChatScreen.jsx        # Chat + camera modal + braille input
│       │   └── MemoriesScreen.jsx    # Memories grid
│       ├── services/
│       │   └── apiService.js
│       └── utils/
│           └── whisper.js            # Web Speech API / Whisper integration
│
├── backend/                          # FastAPI server (shared by all frontends)
│   ├── main.py                       # Entry point, all API routes (v2.0.0)
│   ├── .env                          # Environment config
│   ├── requirements.txt              # Python dependencies
│   ├── database.py                   # Supabase DB operations (profiles, memories, chat_history)
│   ├── vision.py                     # Gemma 4 multimodal vision (image description)
│   ├── chat.py                       # Gemma 4 chatbot with memory-awareness
│   ├── audio.py                      # Speech-to-text (Groq Whisper API)
│   └── tts.py                        # Text-to-Speech (edge-tts, no API key needed)
│
├── hardware/                         # ESP32-S3 Camera Module
│   ├── esp-main.ino                  # ESP32 camera firmware (WiFi stream server)
│   ├── object-detection.py           # Pi-side object detection script
│   ├── yolo26n.pt                    # YOLO model weights
│   └── requirements.txt              # Python deps for Pi module
│
└── README.md                         # This file
```

---

## The Flow

1. **User opens app** → Login/Register screen (with full screen reader support)
2. **Home Screen** → Dashboard with greeting, stats (memories count, last activity), quick actions
3. **Chat Screen** → Dual-view: Chat view (message list) + Camera view (tap left edge to switch)
4. **Tap Capture** → Take photo → Gemma 4 describes the scene → Saves to memories → Speaks aloud
5. **Hold RECORD** → Record voice question → Groq Whisper transcribes → Gemma 4 answers with context
6. **Type text** → Send typed message to Gemma 4 chatbot (supports memory queries, image QA, general chat)
7. **Memories Screen** → 2-column grid of saved memories with images and descriptions
8. **Hardware Interceptor** → Polling sync engine (4s interval) detects new messages from hardware (Pi) and speaks them aloud
9. **Logout** → Two-finger double-tap gesture or button

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Health check |
| `POST` | `/auth/signup` | Create profile (email, password, full_name) |
| `POST` | `/auth/login` | Login (email + password) |
| `POST` | `/auth/logout` | Logout |
| `POST` | `/vision/process` | Process image → Gemma 4 description + save memory |
| `POST` | `/audio/transcribe` | Transcribe audio via Groq Whisper |
| `POST` | `/chat/send` | Send chat message (text or audio_base64) → Gemma 4 response |
| `GET` | `/chat/history` | Get chat history for a user |
| `POST` | `/chat/tts` | Text-to-Speech (returns MP3 audio) |
| `POST` | `/chat/send-audio` | Combined: send audio → transcribe → chat → TTS (returns text + base64 MP3) |
| `POST` | `/agent/interact` | Agent interaction (vision + chat combined) |
| `GET` | `/hardware/pair/{pi_serial}` | Check device pairing status |
| `POST` | `/hardware/webhook` | Receive data from Pi device |

---

## Accessibility Features

- All elements have `accessible`, `accessibilityLabel`, `accessibilityHint`
- Screen reader announcements on every action via `expo-speech`
- Haptic feedback on button presses (`expo-haptics`)
- Light theme with high contrast (white background `#F7F7F7`, warm accent `#F5A623`)
- Voice-first interaction model (record and speak)
- Gesture-based navigation (tap left edge for camera, swipe left/right for tabs, two-finger double-tap for logout)
- Braille input panel (both mobile and web)
- Date separators in chat ("Today", "Yesterday", date headers)

---

## Setup Instructions

### Prerequisites

- **Node.js** 18+ (for frontend/web)
- **Python** 3.10+ (for backend)
- **Expo CLI** (`npm install -g expo-cli`)
- **Supabase** account (for auth, database, storage)
- **Google AI Studio** API key (for Gemma 4)
- **Groq Cloud** API key (for Whisper transcription)

### Environment Variables

Create a `.env` file in `backend/`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
GEMINI_API_KEY=your-google-ai-studio-key
GROQ_API_KEY=your-groq-cloud-key
```

Create a `.env` file in `frontend/`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EXPO_PUBLIC_BACKEND_URL=http://your-backend-url:8000
```

Create a `.env` file in `web/`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_BACKEND_URL=http://your-backend-url:8000
```

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate      # Windows
# source venv/bin/activate  # macOS/Linux
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Mobile Frontend (React Native / Expo)

```bash
cd frontend
npm install
npx expo start
```

### Web Frontend (Vite + React)

```bash
cd web
npm install
npm run dev
```

### Hardware (ESP32-S3 Camera Module)

Flash [`hardware/esp-main.ino`](hardware/esp-main.ino) to an ESP32-S3 with a camera module (AI Thinker). The device streams video over WiFi on port 8080.

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Mobile Frontend** | React Native (Expo SDK 54), React Navigation v7 (Bottom Tabs) |
| **Web Frontend** | Vite + React, React Router v6 |
| **Backend** | Python FastAPI (v2.0.0) |
| **Auth** | Supabase Auth |
| **Database** | Supabase PostgreSQL |
| **Image Storage** | Supabase Storage (bucket: `images`) |
| **Vision AI** | Google Gemma 4 (`gemma-4-26b-a4b-it`) via Google AI Studio |
| **Chatbot AI** | Google Gemma 4 (`gemma-4-26b-a4b-it`) via Google AI Studio |
| **Speech-to-Text** | Groq Cloud Whisper (`whisper-large-v3`) |
| **Text-to-Speech** | edge-tts (Microsoft Edge free TTS, no API key) |
| **Hardware** | ESP32-S3 (AI Thinker camera module), Raspberry Pi |

---

## Key Features

- **Three frontends**: Mobile (React Native/Expo), Web (Vite + React), Hardware (ESP32-S3)
- **Gemma 4 vision**: Multimodal image description with chain-of-thought cleaning
- **Memory-aware chatbot**: Queries past memories, answers image questions, general conversation
- **Combined audio pipeline**: Send audio → transcribe → chat → TTS response in one request
- **Hardware interceptor**: Polling sync engine (4s interval) detects hardware messages and speaks them
- **Date-separated chat**: Messages grouped by "Today", "Yesterday", or date headers
- **Braille input**: Dedicated braille keyboard panel on both mobile and web
- **Gesture navigation**: Tap, swipe, and two-finger gestures for full accessibility
- **Light theme**: Clean white UI with warm accent colors
