# VisionTrace 🚦
**Intelligent Traffic Anomalies & Smart City Video Surveillance Network**

![VisionTrace Dashboard](./image.png)

VisionTrace is a full-stack, real-time AI computer vision platform designed for urban traffic monitoring. It consumes camera feeds, performs frame-by-frame vehicle tracking, estimates lane density, and generates instantaneous emergency warnings when vehicles crash or stall.

## ✨ Features
- **Dynamic Smart Zone Configurator:** Use the interactive frontend UI to draw custom polygonal Regions of Interest (ROI) for *any* camera angle (dashcam, CCTV, top-down).
- **YOLOv8 Object Tracking:** Lightweight and highly optimized vehicle detection (cars, trucks, buses, motorcycles) using intersection over union (IoU) occlusion handling.
- **Traffic Density Estimation:** Real-time counting of vehicles in custom-defined lanes to categorize traffic flow as "Smooth" or "Heavy".
- **Stalled Vehicle Detection:** Mathematically tracks vehicle velocity vectors to instantly flag anomalies like accidents or broken-down vehicles.
- **Real-Time WebSockets:** Ultra-low latency streaming of video frames, bounding boxes, and alert payloads directly to the web dashboard.
- **Utilitarian Dashboard:** A sleek, human-coded, monochrome corporate UI designed for professional control rooms.

---

## 🚀 Getting Started

### 1. Start the AI Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 2. Start the Frontend Dashboard
```bash
cd frontend
npm install
npm run dev
```
Open your browser to `http://localhost:5173`.

---

## 📷 Connecting a Live Camera (RTSP / Webcam)

By default, the system uses a local sample video. To deploy this to a real, live smart-city camera, you simply need to update the `VIDEO_SOURCE` in your `.env` file.

1. Open `backend/.env`.
2. Change the `VIDEO_SOURCE` variable depending on your camera type:

**For an IP Camera / CCTV (RTSP Stream):**
```env
VIDEO_SOURCE=rtsp://username:password@192.168.1.100:554/stream1
```

**For a USB Webcam or Dashcam (Direct connection):**
```env
VIDEO_SOURCE=0
```
*(Use `0` for your primary connected webcam, `1` for the second, etc.)*

Restart the backend server after saving the `.env` file, and VisionTrace will automatically begin analyzing the live feed!
