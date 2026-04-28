import json
import os
from ultralytics import YOLO
from google import genai
from google.genai import types

# --- Configuration ---
IMAGE_PATH = "/Users/damnitjoshua/Developer/Antigravity/EyeDentify/hardware-backend/bus.jpg"

# --- 1. Object Detection with YOLO ---
yolo_model = YOLO("yolo26n.pt")
results = yolo_model(IMAGE_PATH)

# Extract unique detected object class names
detected_objects = list(
    set(results[0].names[cls.item()] for cls in results[0].boxes.cls)
)

# --- 2. Image Captioning with Gemma via Gemini API ---
client = genai.Client(api_key="AIzaSyD6VG2y6pp7M1Eu1OEc013uoWYhBUMr67w")

# Read and encode image as base64 for the API
import base64
with open(IMAGE_PATH, "rb") as f:
    image_data = base64.b64encode(f.read()).decode("utf-8")

model_name = "gemma-4-26b-a4b-it"
contents = [
    types.Content(
        role="user",
        parts=[
            types.Part.from_bytes(data=image_data, mime_type="image/jpeg"),
            types.Part.from_text(text="Describe this image in one sentence."),
        ],
    ),
]

config = types.GenerateContentConfig(
    thinking_config=types.ThinkingConfig(thinking_level="HIGH"),
)

response_text = ""
for chunk in client.models.generate_content_stream(
    model=model_name,
    contents=contents,
    config=config,
):
    if text := chunk.text:
        response_text += text

# --- Output combined JSON ---
output = {
    "detected_objects": sorted(detected_objects),
    "image_caption": response_text.strip(),
}

print(json.dumps(output, indent=2))
