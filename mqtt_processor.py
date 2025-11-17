"""
MQTT Data Processor for IoT Band
Connects to MQTT broker, processes band data, tracks time in states, and generates alerts.
Supports both formats:
1. Simulador Python: dados em um único tópico com JSON
2. Wokwi: tópicos separados para distância (d) e batimentos (b)
"""

import json
import threading
import time
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import paho.mqtt.client as mqtt


class BandDataProcessor:
    """Processes IoT band data from MQTT and tracks work states."""

    def __init__(self, broker: str, port: int, topic_data: str, topic_alerts: str):
        """
        Initialize the processor.
        
        Args:
            broker: MQTT broker address
            port: MQTT broker port
            topic_data: Topic to subscribe for data (supports both formats)
            topic_alerts: Topic to subscribe for alerts
        """
        self.broker = broker
        self.port = port
        self.topic_data = topic_data
        self.topic_alerts = topic_alerts
        
        # Extract base topic (e.g., "TEF/device023/attrs")
        base_topic = topic_data.rsplit('/', 1)[0] if '/' in topic_data else topic_data
        self.topic_heartrate = f"{base_topic}/b"  # Heart rate topic for Wokwi
        self.topic_distance = f"{base_topic}/d"   # Distance topic for Wokwi
        
        # MQTT Client
        try:
            # Para paho-mqtt >= 2.0
            self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)
        except AttributeError:
            # Para paho-mqtt < 2.0
            self.client = mqtt.Client()
        
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.on_disconnect = self._on_disconnect
        
        # State tracking
        self.current_state = {
            "device": "eloyband_01",
            "mode": "WorkOFF",
            "heart_rate": 0,
            "distance_cm": 0,
            "timestamp": datetime.utcnow().isoformat(),
        }
        
        # Temporary storage for Wokwi format (separate topics)
        self.wokwi_data = {
            "heart_rate": 0,
            "distance_cm": 0,
        }
        
        # Time accumulation (in seconds)
        self.time_accumulation = {
            "WorkOFF": 0,
            "WorkON": 0,
            "Working": 0,
        }
        
        # State transition tracking
        self.state_start_time = datetime.utcnow()
        self.last_state = "WorkOFF"
        
        # Alerts
        self.alerts = []
        self.alert_history = []
        
        # Configuration for alerts (in seconds)
        self.OVERWORKING_THRESHOLD = 3600  # 1 hour in WORKING state
        self.LOW_PRODUCTIVITY_RATIO = 2.0  # If WorkON time > 2x WorkING time
        
        # Thread safety
        self.lock = threading.Lock()
        
        # Connection status
        self.is_connected = False

    def _on_connect(self, client, userdata, flags, rc):
        """Callback for when the client connects to the broker."""
        if rc == 0:
            print(f"✅ Connected to MQTT broker at {self.broker}:{self.port}")
            self.is_connected = True
            
            # Subscribe to JSON format topic (Python simulator)
            client.subscribe(self.topic_data)
            print(f"📡 Subscribed to data topic: {self.topic_data}")
            
            # Subscribe to alerts
            client.subscribe(self.topic_alerts)
            print(f"📡 Subscribed to alerts topic: {self.topic_alerts}")
            
            # Subscribe to Wokwi format topics (distance and heart rate)
            client.subscribe(self.topic_distance)
            print(f"📡 Subscribed to Wokwi distance topic: {self.topic_distance}")
            
            client.subscribe(self.topic_heartrate)
            print(f"📡 Subscribed to Wokwi heart rate topic: {self.topic_heartrate}")
            
            print("✅ All subscriptions completed successfully!")
        else:
            print(f"❌ Failed to connect, return code {rc}")
            self.is_connected = False

    def _on_disconnect(self, client, userdata, rc):
        """Callback for when the client disconnects from the broker."""
        if rc != 0:
            print(f"⚠️  Unexpected disconnection, return code {rc}")
        else:
            print("✅ Disconnected from MQTT broker")
        self.is_connected = False

    def _on_message(self, client, userdata, msg):
        """Callback for when a message is received from the broker."""
        print(f"📨 Message received on topic: {msg.topic}")
        print(f"   Payload: {msg.payload.decode()}")
        
        try:
            if msg.topic == self.topic_heartrate or msg.topic == self.topic_distance or msg.topic.endswith('/b') or msg.topic.endswith('/d'):
                # Process as Wokwi format (raw values)
                self._process_wokwi_format(msg.topic, msg.payload.decode())
                return
            
            # Try to decode as JSON (Python simulator format)
            try:
                payload = json.loads(msg.payload.decode())
                
                if msg.topic == self.topic_data:
                    self._process_data_message(payload)
                elif msg.topic == self.topic_alerts:
                    self._process_alert_message(payload)
                else:
                    print(f"⚠️  Received JSON on unexpected topic: {msg.topic}")
            except json.JSONDecodeError:
                print(f"⚠️  Could not parse message as JSON on topic: {msg.topic}")
                
        except Exception as e:
            print(f"❌ Error processing message: {e}")
            import traceback
            traceback.print_exc()

    def _process_data_message(self, data: Dict[str, Any]):
        """Process incoming data from the band (Python simulator format)."""
        with self.lock:
            # Update current state from JSON data
            self.current_state = {
                "device": data.get("device", "eloyband_01"),
                "mode": data.get("mode", "WorkOFF"),
                "heart_rate": data.get("heart_rate", 0),
                "distance_cm": data.get("distance_cm", 0),
                "timestamp": datetime.utcnow().isoformat(),
            }
            
            # Track state transitions and accumulate time
            self._update_time_accumulation()
            
            # Check for alerts
            self._check_alerts()
            
            print(f"📊 [Python] State: {self.current_state['mode']} | HR: {self.current_state['heart_rate']} | Dist: {self.current_state['distance_cm']}cm")

    def _process_wokwi_format(self, topic: str, value: str):
        """Process incoming data from Wokwi format (separate topics for distance and heart rate)."""
        with self.lock:
            try:
                # O Wokwi envia a distância em metros (m), mas o estado interno usa cm.
                # O payload do Wokwi é um valor numérico.
                numeric_value = float(value.strip())
                
                # Flag para saber se um valor foi atualizado
                updated = False
                
                # Determine if it's distance (d) or heart rate (b)
                if topic == self.topic_distance or topic.endswith('/d'):
                    # Converter metros para centímetros (1.85m -> 185cm)
                    self.wokwi_data["distance_cm"] = numeric_value * 100
                    print(f"✅ [Wokwi] Distance received: {numeric_value}m -> {self.wokwi_data['distance_cm']:.0f}cm")
                    updated = True
                elif topic == self.topic_heartrate or topic.endswith('/b'):
                    self.wokwi_data["heart_rate"] = numeric_value
                    print(f"✅ [Wokwi] Heart rate received: {numeric_value:.0f}bpm")
                    updated = True
                else:
                    print(f"⚠️  Unknown Wokwi topic: {topic}")
                    return
                
                # Atualizar o estado e a lógica de acumulação/alerta após receber qualquer dado
                if updated:
                    self._update_state_from_wokwi()
                
            except ValueError as e:
                print(f"⚠️  Could not parse Wokwi value: {value} - Error: {e}")

    def _update_state_from_wokwi(self):
        """Update the current state based on Wokwi data and calculate mode."""
        heart_rate = self.wokwi_data["heart_rate"]
        distance = self.wokwi_data["distance_cm"]
        
        # Calculate mode based on heart rate and distance
        # Distância limite de 50cm (0.5m)
        DISTANCE_THRESHOLD_CM = 50 
        
        if heart_rate == 0:
            # WorkOFF: não detecta batimentos, assume q o funcionario n esta no expediente, ou não esta trabalhando
            mode = "WorkOFF"
        elif heart_rate > 0 and distance > DISTANCE_THRESHOLD_CM:
            # WorkON: detecta batimentos, assume q o funcionario esta no expediente, mas longe do workspace
            mode = "WorkON"
        elif heart_rate > 0 and distance <= DISTANCE_THRESHOLD_CM:
            # Working: detecta batimentos, e esta em uma distancia curta do computador (<= 50cm)
            mode = "Working"
        else:
            # Fallback, deve ser WorkOFF se heart_rate for 0, mas para segurança
            mode = "WorkOFF"
        
        # Update current state
        self.current_state = {
            "device": "eloyband_01",
            "mode": mode,
            "heart_rate": heart_rate,
            "distance_cm": distance,
            "timestamp": datetime.utcnow().isoformat(),
        }
        
        # Track state transitions and accumulate time
        self._update_time_accumulation()
        
        # Check for alerts
        self._check_alerts()
        
        print(f"🔄 [Wokwi] Current State: {mode} | HR: {heart_rate}bpm | Dist: {distance}cm")

    def _process_alert_message(self, data: Any):
        """Process alert messages from MQTT."""
        with self.lock:
            alert_msg = data if isinstance(data, str) else str(data)
            print(f"🚨 Alert received: {alert_msg}")

    def _update_time_accumulation(self):
        """Update time accumulation for the current state."""
        current_time = datetime.utcnow()
        time_delta = (current_time - self.state_start_time).total_seconds()
        
        # Accumulate time for the last state
        if self.last_state in self.time_accumulation:
            self.time_accumulation[self.last_state] += time_delta
        
        # If state changed, reset the start time
        if self.current_state["mode"] != self.last_state:
            self.last_state = self.current_state["mode"]
            self.state_start_time = current_time
            print(f"🔄 State transition to: {self.last_state}")

    def _check_alerts(self):
        """Check for alert conditions based on accumulated time."""
        self.alerts = []
        
        # Alert 1: Overworking
        if self.time_accumulation["Working"] > self.OVERWORKING_THRESHOLD:
            alert = {
                "type": "overworking",
                "message": f"⚠️  Overworking detected! User has been in WORKING state for {self.time_accumulation['Working']:.0f} seconds.",
                "timestamp": datetime.utcnow().isoformat(),
                "severity": "high",
            }
            self.alerts.append(alert)
            self.alert_history.append(alert)
            print(f"🚨 {alert['message']}")
        
        # Alert 2: Low Productivity
        if self.time_accumulation["Working"] > 0:
            ratio = self.time_accumulation["WorkON"] / self.time_accumulation["Working"]
            if ratio > self.LOW_PRODUCTIVITY_RATIO:
                alert = {
                    "type": "low_productivity",
                    "message": f"⚠️  Low productivity detected! WorkON time ({self.time_accumulation['WorkON']:.0f}s) is {ratio:.1f}x higher than WORKING time ({self.time_accumulation['Working']:.0f}s).",
                    "timestamp": datetime.utcnow().isoformat(),
                    "severity": "medium",
                }
                self.alerts.append(alert)
                self.alert_history.append(alert)
                print(f"🚨 {alert['message']}")

    def get_current_state(self) -> Dict[str, Any]:
        """Get the current state of the band."""
        with self.lock:
            return {
                "current_state": self.current_state,
                "time_accumulation": self.time_accumulation,
                "alerts": self.alerts,
                "is_connected": self.is_connected,
            }

    def get_statistics(self) -> Dict[str, Any]:
        """Get statistics about the band usage."""
        with self.lock:
            total_time = sum(self.time_accumulation.values())
            return {
                "time_accumulation": self.time_accumulation,
                "total_time": total_time,
                "percentages": {
                    "WorkOFF": (self.time_accumulation["WorkOFF"] / total_time * 100) if total_time > 0 else 0,
                    "WorkON": (self.time_accumulation["WorkON"] / total_time * 100) if total_time > 0 else 0,
                    "Working": (self.time_accumulation["Working"] / total_time * 100) if total_time > 0 else 0,
                },
                "alert_history": self.alert_history,
            }

    def reset_accumulation(self):
        """Reset time accumulation counters."""
        with self.lock:
            self.time_accumulation = {
                "WorkOFF": 0,
                "WorkON": 0,
                "Working": 0,
            }
            self.alerts = []
            self.alert_history = []
            self.state_start_time = datetime.utcnow()
            print("🔄 Time accumulation reset")

    def connect(self):
        """Connect to the MQTT broker."""
        try:
            self.client.connect(self.broker, self.port, keepalive=60)
            self.client.loop_start()
            print(f"🔗 Connecting to MQTT broker at {self.broker}:{self.port}...")
        except Exception as e:
            print(f"❌ Failed to connect: {e}")

    def disconnect(self):
        """Disconnect from the MQTT broker."""
        self.client.loop_stop()
        self.client.disconnect()
        print("🔌 Disconnected from MQTT broker")
