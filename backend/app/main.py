import os
import asyncio
import json
import base64
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from app.vision import VideoProcessor
from app.database import log_event, get_recent_alerts

app = FastAPI(title="VisionTrace API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

VIDEO_SOURCE = os.getenv("VIDEO_SOURCE", "./sample_traffic.mp4")

@app.get("/alerts")
async def fetch_alerts():
    alerts = await get_recent_alerts()

    for alert in alerts:
        alert["_id"] = str(alert["_id"])
    return {"alerts": alerts}

@app.websocket("/ws/stream")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    processor = VideoProcessor(VIDEO_SOURCE)

    async def receive_config():
        try:
            while True:
                data = await websocket.receive_text()
                config = json.loads(data)
                if config.get("type") == "CONFIG_ZONES":
                    processor.set_zones(config.get("left_polygon"), config.get("right_polygon"))
        except WebSocketDisconnect:
            pass

    receiver_task = asyncio.create_task(receive_config())

    try:
        for frame_bytes, tracking_info, alerts, density in processor.generate_frames():

            for alert in alerts:
                asyncio.create_task(log_event("alert", alert))

            frame_b64 = base64.b64encode(frame_bytes).decode('utf-8')
            payload = {
                "frame": frame_b64,
                "tracking": tracking_info,
                "alerts": alerts,
                "density": density
            }
            await websocket.send_text(json.dumps(payload))

            await asyncio.sleep(0.03) 
    except WebSocketDisconnect:
        print("Client disconnected")
    finally:
        receiver_task.cancel()
        processor.release()
