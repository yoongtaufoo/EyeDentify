"""
EyeDentify Hardware Client (Raspberry Pi)
==========================================
Runs on a Raspberry Pi with camera + Bluetooth button + microphone.

FLOW:
  1. Camera streams in background (preview on Pi display / HDMI).
  2. Bluetooth button PRESS  → capture frame + start voice recording.
  3. Button RELEASE          → stop recording → send image + audio to backend
                              → save to DB (via backend) → speak response.

DEPENDENCIES:
  pip install requests sounddevice numpy pillow python-dotenv bleak picamera2 opencv-python-headless pyttsx3

USAGE:
  sudo python3 object-detection.py

CONFIG: Edit .env file for your settings.
"""

import os
import sys
import io
import base64
import time
import signal
import json
import threading
from pathlib import Path
from datetime import datetime

# --- Load environment ---
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

import requests

# ============================================================
# CONFIGURATION
# ============================================================
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
USER_ID = os.getenv("USER_ID", "")
BUTTON_TYPE = os.getenv("BUTTON_TYPE", "gpio")       # 'ble' | 'gpio' | 'keyboard'
BUTTON_MAC = os.getenv("BUTTON_MAC", "")               # BLE MAC address
GPIO_PIN = int(os.getenv("GPIO_PIN", "17"))            # BCM pin number
CAMERA_TYPE = os.getenv("CAMERA_TYPE", "picamera")     # 'picamera' | 'usb' | 'opencv'
AUDIO_DEVICE_INDEX = os.getenv("AUDIO_DEVICE_INDEX")
if AUDIO_DEVICE_INDEX and AUDIO_DEVICE_INDEX != "None":
    AUDIO_DEVICE_INDEX = int(AUDIO_DEVICE_INDEX)
else:
    AUDIO_DEVICE_INDEX = None

CAMERA_WIDTH = int(os.getenv("CAMERA_WIDTH", "640"))
CAMERA_HEIGHT = int(os.getenv("CAMERA_HEIGHT", "480"))

# Validate critical config
if not USER_ID:
    print("[!] ERROR: USER_ID not set in .env. Set it to your Supabase auth user ID.")
    sys.exit(1)

print(f"[Config] Backend: {BACKEND_URL}")
print(f"[Config] User ID: {USER_ID[:8]}...")
print(f"[Config] Button: {BUTTON_TYPE}")
print(f"[Config] Camera: {CAMERA_TYPE}")


# ============================================================
# CAMERA MANAGER
# ============================================================
class CameraManager:
    """Handles camera streaming and single-frame capture."""

    def __init__(self):
        self.camera = None
        self.latest_frame = None
        self.running = False
        self._lock = threading.Lock()

    def start(self):
        """Initialize camera and start streaming."""
        if CAMERA_TYPE == "picamera":
            self._start_picamera()
        else:
            self._start_opencv()
        self.running = True
        print(f"[Camera] Streaming at {CAMERA_WIDTH}x{CAMERA_HEIGHT}")

    def _start_picamera(self):
        """Start Pi Camera Module via picamera2."""
        from picamera2 import Picamera2
        self.camera = Picamera2()
        preview_config = self.camera.create_preview_configuration(
            main={"size": (CAMERA_WIDTH, CAMERA_HEIGHT)}
        )
        self.camera.configure(preview_config)
        self.camera.start()

        # Background thread to continuously grab frames
        def _grab_loop():
            while self.running:
                with self._lock:
                    self.latest_frame = self.capture_array()
                time.sleep(0.03)  # ~30 fps

        self.capture_array = self.camera.capture_array
        threading.Thread(target=_grab_loop, daemon=True).start()

    def _start_opencv(self):
        """Start USB/Generic camera via OpenCV."""
        import cv2
        self.camera = cv2.VideoCapture(0)
        self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
        self.camera.set(cv3.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)

        def _grab_loop():
            while self.running:
                ret, frame = self.camera.read()
                if ret:
                    with self._lock:
                        self.latest_frame = frame.copy()
                time.sleep(0.03)

        threading.Thread(target=_grab_loop, daemon=True).start()

    def capture_jpeg_bytes(self) -> bytes | None:
        """Capture current frame as JPEG bytes."""
        with self._lock:
            frame = self.latest_frame

        if frame is None:
            return None

        import cv2
        encode_params = [cv2.IMWRITE_JPEG_QUALITY, 85]
        _, jpeg_data = cv2.imencode(".jpg", frame, encode_params)
        return jpeg_data.tobytes() if jpeg_data is not None else None

    def stop(self):
        self.running = False
        if self.camera:
            if CAMERA_TYPE == "picamera":
                self.camera.stop()
            else:
                import cv2
                self.camera.release()
        print("[Camera] Stopped.")


# ============================================================
# AUDIO RECORDER
# ============================================================
class AudioRecorder:
    """Records audio from microphone using sounddevice."""

    def __init__(self):
        self.recording = False
        self.audio_frames = []
        self._stream = None
        self._sd = None

    def start_recording(self):
        """Begin recording audio."""
        import sounddevice as sd
        self._sd = sd
        self.audio_frames = []
        self.recording = True

        def callback(indata, frames, time_info, status):
            if self.recording:
                self.audio_frames.append(indata.copy())

        self._stream = sd.InputStream(
            samplerate=16000,
            channels=1,
            dtype="int16",
            device=AUDIO_DEVICE_INDEX,
            callback=callback,
        )
        self._stream.start()
        print("[Audio] Recording...")

    def stop_recording(self) -> str | None:
        """Stop recording and return base64-encoded WAV data."""
        self.recording = False
        if self._stream:
            self._stream.stop()
            self._stream.close()

        if not self.audio_frames:
            print("[Audio] No audio recorded.")
            return None

        import numpy as np
        audio_data = np.concatenate(self.audio_frames, axis=0)

        # Convert to WAV bytes
        import wave
        import struct
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(audio_data.tobytes())
        wav_bytes = buf.getvalue()

        b64_audio = base64.b64encode(wav_bytes).decode("utf-8")
        duration_s = len(audio_data) / 16000
        print(f"[Audio] Recorded {duration_s:.1f}s, base64 size: ~{len(b64_audio) // 1024}KB")
        return b64_audio


# ============================================================
# TTS (Text-to-Speech) - Local on Pi
# ============================================================
def speak(text: str):
    """Speak text aloud on the Pi using espeak/pyttsx3."""
    try:
        import pyttsx3
        engine = pyttsx3.init()
        engine.setProperty("rate", 150)
        engine.say(text)
        engine.runAndWait()
    except Exception:
        # Fallback: use espeak command line
        try:
            import subprocess
            subprocess.run(["espeak", f'"{text}"', "-s", "140"], check=False)
        except Exception as e:
            print(f"[TTS] Could not speak: {e}")
            print(f"[TTS] Response text: {text}")


# ============================================================
# BUTTON HANDLERS
# ============================================================

class ButtonListener:
    """Abstract button listener. Subclasses implement press/release detection."""

    def __init__(self, on_press_callback, on_release_callback):
        self.on_press = on_press_callback
        self.on_release = on_release_callback


class GPIOButtonListener(ButtonListener):
    """Wired button on a GPIO pin using RPi.GPIO or gpiozero."""

    def start(self):
        try:
            from gpiozero import Button
            btn = Button(GPIO_PIN, hold_time=9999, hold_repeat=False)
            btn.when_pressed = self.on_press
            btn.when_released = self.on_release
            print(f"[Button] GPIO pin {GPIO_PIN} ready (gpiozero).")
            # Block so thread stays alive
            import pause
            pause.forever()
        except ImportError:
            pass

        # Fallback: RPi.GPIO manual polling
        import RPi.GPIO as GPIO
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(GPIO_PIN, GPIO.IN, pull_up_down=GPIO.PUD_UP)
        print(f"[Button] GPIO pin {GPIO_PIN} ready (RPi.GPIO polling).")

        last_state = GPIO.input(GPIO_PIN)  # 1=unpressed (pull-up), 0=pressed
        while True:
            state = GPIO.input(GPIO_PIN)
            if state != last_state:
                if state == 0:   # Pressed (pulled low)
                    self.on_press()
                else:            # Released
                    self.on_release()
                last_state = state
            time.sleep(0.02)


class BLEButtonListener(ButtonListener):
    """BLE button listener (e.g., Flic button, generic BLE HID)."""

    def start(self):
        import asyncio
        asyncio.run(self._ble_loop())

    async def _ble_loop(self):
        import bleak

        if not BUTTON_MAC:
            print("[!] ERROR: BUTTON_MAC not set for BLE mode.")
            print("[!] Find it with: `hcitool lescan` or `bluetoothctl scan le`")
            sys.exit(1)

        print(f"[Button] Scanning for BLE button at {BUTTON_MAC}...")

        async with bleak.BleakClient(BUTTON_MAC) as client:
            print(f"[Button] Connected! Listening for button events...")

            # Generic notification subscription approach
            # This varies by device - Flic uses specific service/char UUIDs
            # For generic HID, we subscribe to the HID service
            try:
                # Try Flic button UUIDs first
                flic_svc = "0000ffe0-0000-1000-8000-00805f9b34fb"
                flic_char = "0000ffe1-0000-1000-8000-00805f9b34fb"
                await client.start_notify(
                    flic_char,
                    lambda sender, data: self._handle_ble_data(data),
                )
            except Exception:
                # Fallback: try to read any characteristic
                services = client.services
                print(f"[Button] Found services: {[str(s.uuid) for s in services]}")

            while True:
                await asyncio.sleep(0.1)

    def _handle_ble_data(self, data: bytearray):
        """Interpret raw BLE data as button press/release."""
        # Fic button: byte[0] == 0x01 = click down, 0x00 = click up
        if len(data) > 0:
            if data[0] & 0x01:
                self.on_press()
            else:
                self.on_release()


class KeyboardHIDButtonListener(ButtonListener):
    """Listens for a specific keypress (e.g., spacebar) from USB/HID keyboard."""

    def __init__(self, on_press_callback, on_release_callback, trigger_key="space"):
        super().__init__(on_press_callback, on_release_callback)
        self.trigger_key = trigger_key.lower()

    def start(self):
        try:
            from pynput import keyboard

            def on_press_fn(key):
                key_name = getattr(key, "name", str(key)).lower()
                if key_name == self.trigger_key:
                    self.on_press()

            def on_release_fn(key):
                key_name = getattr(key, "name", str(key)).lower()
                if key_name == self.trigger_key:
                    self.on_release()

            listener = keyboard.Listener(on_press=on_press_fn, on_release=on_release_fn)
            listener.start()
            print(f"[Button] HID keyboard mode. Press '{self.trigger_key}' to activate.")
            listener.join()
        except ImportError:
            print("[!] ERROR: Install pynput: `pip install pynput`")
            sys.exit(1)


def create_button_listener(on_press, on_release) -> ButtonListener:
    """Factory: create the right button listener based on config."""
    listeners = {
        "gpio": lambda: GPIOButtonListener(on_press, on_release),
        "ble": lambda: BLEButtonListener(on_press, on_release),
        "keyboard": lambda: KeyboardHIDButtonListener(on_press, on_release),
    }
    factory = listeners.get(BUTTON_TYPE)
    if not factory:
        print(f"[!] Unknown button type: {BUTTON_TYPE}. Options: gpio, ble, keyboard")
        sys.exit(1)
    return factory()


# ============================================================
# BACKEND API CLIENT
# ============================================================

def send_to_backend(image_b64: str, audio_b64: str | None) -> dict:
    """
    Send captured image + optional audio question to backend.
    Returns parsed JSON response.

    Uses the same pipeline as the mobile app:
      POST /vision/process  → saves image, gets description + memory_id
      POST /chat/send       → sends audio question (optional), gets AI reply
    """
    headers = {"Accept": "application/json"}

    # Step 1: Process image through vision pipeline
    print("[API] Sending image to vision pipeline...")
    vision_resp = requests.post(
        f"{BACKEND_URL}/vision/process",
        data={
            "user_id": USER_ID,
            "image_base64": image_b64,
            "source": "hardware",
        },
        headers=headers,
        timeout=60,
    )

    if vision_resp.status_code != 200:
        raise RuntimeError(f"Vision API error ({vision_resp.status_code}): {vision_resp.text}")

    vision_result = vision_resp.json()
    description = vision_result.get("description", "")
    memory_id = vision_result.get("memory_id", "")
    objects = vision_result.get("objects", [])
    print(f"[API] Vision result: {description}")

    # Step 2: If there's an audio question, send it through chat
    ai_response_text = description  # Default fallback: just the description
    if audio_b64:
        print("[API] Sending audio question to chat pipeline...")
        chat_resp = requests.post(
            f"{BACKEND_URL}/chat/send",
            data={
                "user_id": USER_ID,
                "audio_base64": audio_b64,
                "current_description": description,
                "current_memory_id": memory_id,
            },
            headers=headers,
            timeout=60,
        )

        if chat_resp.status_code == 200:
            chat_result = chat_resp.json()
            ai_response_text = chat_result.get("response", description)
            print(f"[API] Chat response: {ai_response_text[:100]}...")
        else:
            print(f"[API] Chat error ({chat_resp.status_code}), using vision description.")

    return {
        "description": description,
        "response": ai_response_text,
        "objects": objects,
        "memory_id": memory_id,
    }


# ============================================================
# MAIN APPLICATION STATE MACHINE
# ============================================================

class EyeDentifyHardwareApp:
    """
    Main app state machine.
    
    States:
      IDLE     → waiting for button press
      ACTIVE   → button held: showing live view + recording audio
      PROCESSING → sending to backend + speaking result
    """

    def __init__(self):
        self.state = "IDLE"
        self.camera = CameraManager()
        self.recorder = AudioRecorder()
        self.captured_image_b64: str | None = None
        self.captured_audio_b64: str | None = None
        self._processing_lock = threading.Lock()

    def run(self):
        """Entry point: init everything, wait for events."""
        speak("Eye Dentify hardware ready. Hold the button to capture and ask a question.")
        print("=" * 50)
        print("EyeDentify Hardware Client Running")
        print(f"  Button type : {BUTTON_TYPE}")
        print(f"  Camera      : {CAMERA_TYPE}")
        print(f"  Backend     : {BACKEND_URL}")
        print("-" * 50)
        print("PRESS button   → Capture photo + Start recording voice")
        print("RELEASE button → Stop recording + Send to AI + Speak result")
        print("Ctrl+C to quit")
        print("=" * 50)

        # Start camera
        try:
            self.camera.start()
        except Exception as e:
            print(f"[!] Camera failed to start: {e}")
            print("[!] Make sure the camera is connected and properly configured.")
            # Continue without camera — will fail gracefully on capture

        # Create and start button listener (this blocks)
        listener = create_button_listener(
            on_press=self._on_button_press,
            on_release=self._on_button_release,
        )
        try:
            listener.start()
        except KeyboardInterrupt:
            pass
        finally:
            self.shutdown()

    # --- Event Handlers ---

    def _on_button_press(self):
        """Button pressed: capture image + start recording."""
        if self.state != "IDLE":
            return  # Ignore if already processing

        self.state = "ACTIVE"

        # 1. Capture image immediately
        jpeg_bytes = self.camera.capture_jpeg_bytes()
        if jpeg_bytes:
            self.captured_image_b64 = base64.b64encode(jpeg_bytes).decode("utf-8")
            print(f"[Capture] Image saved (~{len(self.captured_image_b64) // 1024}KB)")
        else:
            print("[Capture] WARNING: No frame available!")

        # 2. Start audio recording (user speaks their question)
        self.recorder.start_recording()

        # Feedback sound / haptic would go here (LED blink, buzzer beep, etc.)
        print("[Event] ▶ BUTTON PRESSED — capturing + listening...")

    def _on_button_release(self):
        """Button released: stop recording + process + speak result."""
        if self.state != "ACTIVE":
            return

        self.state = "PROCESSING"
        print("[Event] ⏹ BUTTON RELEASED — processing...")

        # Stop recording
        self.captured_audio_b64 = self.recorder.stop_recording()

        # Process in background thread so button listener stays responsive
        threading.Thread(target=self._process_and_respond, daemon=True).start()

    def _process_and_respond(self):
        """Send to backend, then speak the response."""
        if not self.captured_image_b64:
            speak("No image was captured. Please try again.")
            self.state = "IDLE"
            return

        try:
            # Play a short acknowledgment
            speak("Processing. Please wait.")

            # Send to backend (same pipeline as mobile app)
            result = send_to_backend(
                image_b64=self.captured_image_b64,
                audio_b64=self.captured_audio_b64,
            )

            # Speak the AI response
            response_text = result.get("response", result.get("description", "No response."))
            print(f"\n{'='*50}")
            print(f"[RESULT] {response_text}")
            print(f"{'='*50}\n")
            speak(response_text)

        except requests.exceptions.ConnectionError:
            print("[!] Cannot reach backend. Is it running?")
            speak("Cannot connect to the server. Check your connection.")
        except Exception as e:
            print(f"[!] Processing error: {e}")
            speak("Something went wrong. Please try again.")
        finally:
            # Reset state
            self.captured_image_b64 = None
            self.captured_audio_b64 = None
            self.state = "IDLE"
            print("[State] → Ready (waiting for button press)")

    def shutdown(self):
        """Clean up resources."""
        self.camera.stop()
        speak("Goodbye.")


# ============================================================
# ENTRY POINT
# ============================================================

def sigint_handler(sig, frame):
    """Handle Ctrl+C gracefully."""
    print("\n[!] Shutting down...")
    sys.exit(0)


if __name__ == "__main__":
    signal.signal(signal.SIGINT, sigint_handler)

    app = EyeDentifyHardwareApp()
    app.run()
