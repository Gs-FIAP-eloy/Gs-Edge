import paho.mqtt.client as mqtt
import json
import time
import random

BROKER = "44.223.43.74"
PORT = 1883

TOPIC_DATA = "TEF/device023/attrs/d"
TOPIC_ALERTS = "TEF/device023/attrs/a"

client = mqtt.Client()
client.connect(BROKER, PORT, 60)
client.loop_start()

def calcular_modo(hr, dist):
    if hr == 0:
        return "WorkOFF"
    if hr > 0 and dist > 50:
        return "WorkON"
    if hr > 0 and dist <= 50:
        return "Working"

while True:
    # Simulação
    heart_rate = random.choice([0, random.randint(60, 95)])
    distance = random.randint(0, 120)

    mode = calcular_modo(heart_rate, distance)

    data = {
        "device": "eloyband_01",
        "heart_rate": heart_rate,
        "distance_cm": distance,
        "mode": mode,
        "timestamp": int(time.time())
    }

    print("📤 Enviando:", data)
    client.publish(TOPIC_DATA, json.dumps(data))

    # Simulação de possível alerta
    if mode == "Working" and random.random() < 0.05:
        client.publish(TOPIC_ALERTS, "ALERTA: Funcionário possivelmente em overworking")

    time.sleep(2)
