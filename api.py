"""
FastAPI REST API for IoT Band Data
Exposes endpoints for the React dashboard to consume band data and alerts.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os
from mqtt_processor import BandDataProcessor

# Configuration
BROKER = os.getenv("MQTT_BROKER", "44.223.43.74")
PORT = int(os.getenv("MQTT_PORT", 1883))
TOPIC_DATA = os.getenv("MQTT_TOPIC_DATA", "TEF/device023/attrs/d")
TOPIC_ALERTS = os.getenv("MQTT_TOPIC_ALERTS", "TEF/device023/attrs/a")

# Global processor instance
processor: BandDataProcessor = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for FastAPI.
    Handles startup and shutdown of the MQTT processor.
    """
    global processor
    
    # Startup
    print("🚀 Starting IoT Band Data API...")
    print(f"📡 MQTT Broker: {BROKER}:{PORT}")
    print(f"📡 Data Topic: {TOPIC_DATA}")
    print(f"📡 Alerts Topic: {TOPIC_ALERTS}")
    
    processor = BandDataProcessor(BROKER, PORT, TOPIC_DATA, TOPIC_ALERTS)
    processor.connect()
    
    yield
    
    # Shutdown
    print("🛑 Shutting down IoT Band Data API...")
    if processor:
        processor.disconnect()


# Create FastAPI app
app = FastAPI(
    title="IoT Band Data API",
    description="REST API for IoT band data processing and alerts",
    version="1.0.0",
    lifespan=lifespan,
)

# Add CORS middleware to allow requests from the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://eloydashboard.vercel.app"],  # Frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Health & Status Endpoints
# ============================================================================

@app.get("/health")
async def health_check():
    """Check if the API is running."""
    return {
        "status": "ok",
        "mqtt_connected": processor.is_connected if processor else False,
    }


@app.get("/status")
async def get_status():
    """Get the current status of the MQTT connection and processor."""
    if not processor:
        raise HTTPException(status_code=503, detail="Processor not initialized")
    
    return {
        "mqtt_connected": processor.is_connected,
        "broker": processor.broker,
        "port": processor.port,
        "topics": {
            "data": processor.topic_data,
            "alerts": processor.topic_alerts,
            "heartrate": processor.topic_heartrate,
            "distance": processor.topic_distance,
        },
    }


# ============================================================================
# Data Endpoints
# ============================================================================

@app.get("/api/band/current")
async def get_current_state():
    """Get the current state of the band."""
    if not processor:
        raise HTTPException(status_code=503, detail="Processor not initialized")
    
    return processor.get_current_state()


@app.get("/api/band/statistics")
async def get_statistics():
    """Get statistics about band usage."""
    if not processor:
        raise HTTPException(status_code=503, detail="Processor not initialized")
    
    return processor.get_statistics()


@app.get("/api/band/alerts")
async def get_alerts():
    """Get current active alerts."""
    if not processor:
        raise HTTPException(status_code=503, detail="Processor not initialized")
    
    state = processor.get_current_state()
    return {
        "alerts": state["alerts"],
        "alert_count": len(state["alerts"]),
    }


@app.get("/api/band/alerts/history")
async def get_alert_history():
    """Get alert history."""
    if not processor:
        raise HTTPException(status_code=503, detail="Processor not initialized")
    
    stats = processor.get_statistics()
    return {
        "alert_history": stats["alert_history"],
        "total_alerts": len(stats["alert_history"]),
    }


# ============================================================================
# Control Endpoints
# ============================================================================

@app.post("/api/band/reset")
async def reset_data():
    """Reset time accumulation and alerts."""
    if not processor:
        raise HTTPException(status_code=503, detail="Processor not initialized")
    
    processor.reset_accumulation()
    return {"message": "Data reset successfully"}


# ============================================================================
# Root Endpoint
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "IoT Band Data API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "status": "/status",
            "current_state": "/api/band/current",
            "statistics": "/api/band/statistics",
            "alerts": "/api/band/alerts",
            "alert_history": "/api/band/alerts/history",
            "reset": "/api/band/reset (POST)",
        },
        "docs": "/docs",
    }


if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
