import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "visiontrace")

client = AsyncIOMotorClient(MONGO_URI)
db = client[MONGO_DB_NAME]

async def log_event(event_type: str, details: dict):
    """
    Writes an instantaneous event tracking object to MongoDB.
    """
    collection = db["events"]
    await collection.insert_one({
        "type": event_type,
        "details": details,
        "timestamp": details.get("timestamp", None)
    })

async def get_recent_alerts(limit: int = 50):
    collection = db["events"]
    cursor = collection.find({"type": "alert"}).sort("timestamp", -1).limit(limit)
    return await cursor.to_list(length=limit)
