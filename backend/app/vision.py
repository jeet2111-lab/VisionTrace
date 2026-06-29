import cv2
import numpy as np
import math
from ultralytics import YOLO
import time
from app.database import log_event

model = YOLO('yolov8s.pt')

class VideoProcessor:
    def __init__(self, video_source):
        self.video_source = video_source
        self.cap = cv2.VideoCapture(self.video_source)
        self.track_history = {}
        self.alert_flags = {}
        self.left_polygon = None
        self.right_polygon = None

    def set_zones(self, left_polygon, right_polygon):
        self.left_polygon = left_polygon
        self.right_polygon = right_polygon

    def generate_frames(self):

        crop_y1, crop_y2 = 100, 320
        lane_threshold_x = 320
        heavy_traffic_threshold = 5

        while self.cap.isOpened():
            success, frame = self.cap.read()
            if not success:

                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue

            frame = cv2.resize(frame, (640, 360))

            detection_frame = frame.copy()

            if self.left_polygon and self.right_polygon:
                mask = np.zeros(detection_frame.shape[:2], dtype=np.uint8)
                cv2.fillPoly(mask, [np.array(self.left_polygon, np.int32)], 255)
                cv2.fillPoly(mask, [np.array(self.right_polygon, np.int32)], 255)
                detection_frame = cv2.bitwise_and(detection_frame, detection_frame, mask=mask)
            else:
                detection_frame[:crop_y1, :] = 0
                detection_frame[crop_y2:, :] = 0

            results = model.track(detection_frame, persist=True, conf=0.3, iou=0.6, classes=[2, 3, 5, 7], verbose=False, imgsz=320)

            alerts = []
            tracking_info = []

            vehicles_left = 0
            vehicles_right = 0

            if results[0].boxes.id is not None:
                boxes = results[0].boxes.xyxy.cpu().numpy()
                track_ids = results[0].boxes.id.int().cpu().tolist()

                for box, track_id in zip(boxes, track_ids):
                    x1, y1, x2, y2 = box
                    center_x = (x1 + x2) / 2
                    center_y = (y1 + y2) / 2

                    lane = "unknown"
                    if self.left_polygon and self.right_polygon:
                        if cv2.pointPolygonTest(np.array(self.left_polygon, np.int32), (center_x, center_y), False) >= 0:
                            vehicles_left += 1
                            lane = "left"
                        elif cv2.pointPolygonTest(np.array(self.right_polygon, np.int32), (center_x, center_y), False) >= 0:
                            vehicles_right += 1
                            lane = "right"
                    else:
                        if center_x < lane_threshold_x:
                            vehicles_left += 1
                            lane = "left"
                        else:
                            vehicles_right += 1
                            lane = "right"

                    tracking_info.append({
                        "id": track_id,
                        "box": [float(x1), float(y1), float(x2), float(y2)],
                        "lane": lane
                    })

                    if track_id not in self.track_history:
                        self.track_history[track_id] = []

                    self.track_history[track_id].append((center_x, center_y, time.time()))

                    if len(self.track_history[track_id]) > 30:
                        self.track_history[track_id].pop(0)

                    history = self.track_history[track_id]
                    if len(history) == 30:
                        first_pos = history[0]
                        last_pos = history[-1]

                        dist = math.hypot(last_pos[0] - first_pos[0], last_pos[1] - first_pos[1])
                        time_diff = last_pos[2] - first_pos[2]

                        if time_diff > 0:
                            speed = dist / time_diff

                            if speed < 1.0 and track_id not in self.alert_flags:
                                alert_data = {
                                    "track_id": track_id,
                                    "type": "STALL_DETECTED",
                                    "message": f"Vehicle {track_id} has stalled.",
                                    "timestamp": time.time()
                                }
                                alerts.append(alert_data)
                                self.alert_flags[track_id] = True

            intensity_left = "Heavy" if vehicles_left > heavy_traffic_threshold else "Smooth"
            intensity_right = "Heavy" if vehicles_right > heavy_traffic_threshold else "Smooth"

            if self.left_polygon and self.right_polygon:
                density_payload = {
                    "type": "polygon",
                    "counts": {"left": vehicles_left, "right": vehicles_right},
                    "intensity": {"left": intensity_left, "right": intensity_right},
                    "left_polygon": self.left_polygon,
                    "right_polygon": self.right_polygon
                }
            else:
                density_payload = {
                    "type": "default",
                    "counts": {"left": vehicles_left, "right": vehicles_right},
                    "intensity": {"left": intensity_left, "right": intensity_right},
                    "lane_threshold_x": lane_threshold_x,
                    "crop_y1": crop_y1,
                    "crop_y2": crop_y2
                }

            ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 50])
            frame_bytes = buffer.tobytes()

            yield frame_bytes, tracking_info, alerts, density_payload

    def release(self):
        self.cap.release()
