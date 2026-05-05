#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>

// ==========================================
// SELECT YOUR CAMERA BOARD (Uncomment ONE)
// ==========================================
#define CAMERA_MODEL_AI_THINKER   // Most common ESP32-S3-CAM module
// #define CAMERA_MODEL_ESP32S3_EYE
// #define CAMERA_MODEL_FREENOVE_ESP32S3_CAM
// #define CAMERA_MODEL_XIAO_ESP32S3

// ==========================================
// PIN DEFINITIONS
// ==========================================
#if defined(CAMERA_MODEL_AI_THINKER)
  #define PWDN_GPIO_NUM     -1
  #define RESET_GPIO_NUM    -1
  #define XCLK_GPIO_NUM     15
  #define SIOD_GPIO_NUM     4
  #define SIOC_GPIO_NUM     5
  #define Y9_GPIO_NUM       16
  #define Y8_GPIO_NUM       17
  #define Y7_GPIO_NUM       18
  #define Y6_GPIO_NUM       12
  #define Y5_GPIO_NUM       10
  #define Y4_GPIO_NUM       8
  #define Y3_GPIO_NUM       9
  #define Y2_GPIO_NUM       11
  #define VSYNC_GPIO_NUM    6
  #define HREF_GPIO_NUM     7
  #define PCLK_GPIO_NUM     13
#elif defined(CAMERA_MODEL_ESP32S3_EYE)
  #define PWDN_GPIO_NUM     -1
  #define RESET_GPIO_NUM    -1
  #define XCLK_GPIO_NUM     15
  #define SIOD_GPIO_NUM     4
  #define SIOC_GPIO_NUM     5
  #define Y9_GPIO_NUM       16
  #define Y8_GPIO_NUM       17
  #define Y7_GPIO_NUM       18
  #define Y6_GPIO_NUM       12
  #define Y5_GPIO_NUM       10
  #define Y4_GPIO_NUM       8
  #define Y3_GPIO_NUM       9
  #define Y2_GPIO_NUM       11
  #define VSYNC_GPIO_NUM    6
  #define HREF_GPIO_NUM     7
  #define PCLK_GPIO_NUM     13
#else
  #error "Camera model not selected. Uncomment one CAMERA_MODEL_... above!"
#endif

// ==========================================
// WIFI & SERVER CONFIG
// ==========================================
const char* ssid = "GarminVisitor";
const char* password = "GRMN@lobby";

WebServer server(8080);

const char index_html[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ESP32-S3 Camera Stream</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; margin-top: 20px; background: #121212; color: #e0e0e0; }
        h1 { margin-bottom: 10px; }
        .info { margin: 10px auto; padding: 10px; background: #1e1e1e; border-radius: 8px; max-width: 600px; }
        img { border: 2px solid #333; max-width: 90%; height: auto; border-radius: 4px; margin-top: 10px; }
        button { padding: 10px 20px; margin: 15px; font-size: 16px; cursor: pointer; background: #4CAF50; color: white; border: none; border-radius: 4px; }
        button:hover { background: #45a049; }
    </style>
</head>
<body>
    <h1>ESP32-S3 Camera Stream</h1>
    <div class="info">
        <p>Resolution: 320x240 | Mode: Frame Refresh</p>
    </div>
    <div>
        <img id="stream" src="/stream" style="max-width: 800px;">
    </div>
    <div>
        <button onclick="location.reload()">Refresh Page</button>
    </div>
    <script>
        // Refresh every 500ms for stable WebServer performance
        setInterval(() => {
            document.getElementById('stream').src = '/stream?t=' + Date.now();
        }, 500);
    </script>
</body>
</html>
)rawliteral";

void setup() {
    Serial.begin(115200);
    Serial.println("\n\n=== ESP32-S3 Camera Server ===");

    camera_config_t config;
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer = LEDC_TIMER_0;
    config.pin_d0 = Y2_GPIO_NUM;
    config.pin_d1 = Y3_GPIO_NUM;
    config.pin_d2 = Y4_GPIO_NUM;
    config.pin_d3 = Y5_GPIO_NUM;
    config.pin_d4 = Y6_GPIO_NUM;
    config.pin_d5 = Y7_GPIO_NUM;
    config.pin_d6 = Y8_GPIO_NUM;
    config.pin_d7 = Y9_GPIO_NUM;
    config.pin_xclk = XCLK_GPIO_NUM;
    config.pin_pclk = PCLK_GPIO_NUM;
    config.pin_vsync = VSYNC_GPIO_NUM;
    config.pin_href = HREF_GPIO_NUM;
    config.pin_sscb_sda = SIOD_GPIO_NUM;
    config.pin_sscb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn = PWDN_GPIO_NUM;
    config.pin_reset = RESET_GPIO_NUM;
    config.xclk_freq_hz = 20000000;
    config.pixel_format = PIXFORMAT_JPEG;
    config.frame_size = FRAMESIZE_QVGA;
    config.jpeg_quality = 12;
    config.fb_count = 2;
    config.grab_mode = CAMERA_GRAB_LATEST;
    config.fb_location = CAMERA_FB_IN_PSRAM;

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("❌ Camera init failed: 0x%x\n", err);
        while (true) delay(1000);
    }
    Serial.println("✅ Camera initialized!");

    WiFi.begin(ssid, password);
    Serial.print("📶 Connecting to WiFi");
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 40) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("\n❌ WiFi failed!");
        while (true) delay(1000);
    }

    Serial.println("\n✅ WiFi connected!");
    Serial.printf("🌐 IP: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("📺 Stream: http://%s:8080\n", WiFi.localIP().toString().c_str());

    server.on("/", HTTP_GET, []() {
        server.send(200, "text/html", index_html);
    });

    server.on("/stream", HTTP_GET, []() {
        camera_fb_t *fb = esp_camera_fb_get();
        if (!fb) {
            server.send(500, "text/plain", "Capture failed");
            Serial.println("⚠️ fb_get() returned NULL");
            return;
        }

        // Validate JPEG header (SOI marker: FF D8)
        if (fb->len == 0 || fb->buf[0] != 0xFF || fb->buf[1] != 0xD8) {
            Serial.printf("⚠️ Corrupt frame: len=%u, hdr=0x%02X 0x%02X\n", fb->len, fb->buf[0], fb->buf[1]);
            esp_camera_fb_return(fb);
            server.send(500, "text/plain", "Invalid JPEG");
            return;
        }

        Serial.printf("📸 Frame OK: %u bytes\n", fb->len);

        // ✅ ROBUST BINARY SEND: Manual HTTP headers + direct client write
        WiFiClient client = server.client();
        client.print("HTTP/1.1 200 OK\r\n");
        client.print("Content-Type: image/jpeg\r\n");
        client.print("Content-Length: ");
        client.print(fb->len);
        client.print("\r\nConnection: close\r\n\r\n");
        client.write(fb->buf, fb->len);
        client.stop();

        esp_camera_fb_return(fb);
    });

    server.begin();
    Serial.println("🚀 Server started!");
}

void loop() {
    server.handleClient();
    delay(2);
}