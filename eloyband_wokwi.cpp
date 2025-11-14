#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>

// ============ CONFIGURAÇÕES WiFi ============
const char* ssid = "Wokwi-GUEST";
const char* password = "";

// ============ CONFIGURAÇÕES MQTT ============
const char* mqtt_server = "broker.emqx.io";
const int mqtt_port = 1883;
const char* topic_data = "eloy/band01/data";
const char* topic_alerts = "eloy/band01/alerts";

// ============ PINOS ============
const int POTENTIOMETER_PIN = 34;
const int TRIGGER_PIN = 5;
const int ECHO_PIN = 18;

// LEDs
const int LED_GREEN = 25;
const int LED_YELLOW = 26;
const int LED_RED = 27;

// ============ VARIÁVEIS GLOBAIS ============
WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastPublish = 0;
const unsigned long PUBLISH_INTERVAL = 2000UL;

float emaHR = 0.0;        // filtro exponencial para HR (valores reais)
float emaDistance = 999;  // filtro exponencial para distância
const float EMA_ALPHA = 0.25; // suavização: 0..1 (maior = mais responsivo)

unsigned long workingSince = 0;
bool lastAlertSent = false;
String lastMode = "WorkOFF";

// ============ PROTÓTIPOS ============
void setup_wifi();
void reconnect_mqtt();
void publishData(int hr, float distance, const String &mode);
void publishAlert(const String &msg);
int readRawHeartRate();
float readRawDistance();
String calcularModo(int hr, float distance);
unsigned long getEpoch();

// ============ SETUP ============
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n\n=== EloyBand - Wokwi Simulation (LOGIC IMPROVED) ===");

  pinMode(TRIGGER_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_RED, OUTPUT);

  // inicia WiFi e NTP
  setup_wifi();
  configTime(0, 0, "pool.ntp.org", "time.google.com"); // tenta obter hora via NTP

  // mqtt
  client.setServer(mqtt_server, mqtt_port);

  // seed para random usado nos alerts
  randomSeed((uint32_t)esp_random());

  Serial.println("Setup completo!");
}

// ============ LOOP PRINCIPAL ============
void loop() {
  // wifi recon
  if (WiFi.status() != WL_CONNECTED) {
    setup_wifi();
  }

  // mqtt recon
  if (!client.connected()) {
    reconnect_mqtt();
  }
  client.loop();

  if (millis() - lastPublish >= PUBLISH_INTERVAL) {
    lastPublish = millis();

    // leituras brutas
    int rawHR = readRawHeartRate();       // 0 ou 60..120
    float rawDist = readRawDistance();   // cm, 999 = inválido

    // aplicar EMA (se primeira vez, inicializar)
    if (emaHR == 0.0) emaHR = rawHR;
    else emaHR = EMA_ALPHA * rawHR + (1.0 - EMA_ALPHA) * emaHR;

    if (emaDistance == 999) emaDistance = rawDist;
    else emaDistance = EMA_ALPHA * rawDist + (1.0 - EMA_ALPHA) * emaDistance;

    // arredondamentos para tomada de decisão
    int hrForLogic = (int)round(emaHR);
    float distForLogic = emaDistance;

    // se distância inválida (999) tratar como muito longe
    if (distForLogic >= 900) distForLogic = 999;

    // calcular modo com a lógica do Python fornecido
    String mode = calcularModo(hrForLogic, distForLogic);

    // gerenciar tempo em Working para possíveis decisões futuras
    if (mode == "Working" && lastMode != "Working") {
      workingSince = millis();
      lastAlertSent = false;
    }

    // comportamento de alerta: quando em Working, 5% de chance a cada envio
    if (mode == "Working") {
      // 5% chance
      if (!lastAlertSent) {
        int r = random(0, 100); // 0..99
        if (r < 5) {
          publishAlert("ALERTA: Funcionário possivelmente em overworking");
          lastAlertSent = true;
        }
      }
    } else {
      lastAlertSent = false;
    }

    // publicar dados
    publishData(hrForLogic, distForLogic, mode);

    // atualizar LEDs
    if (mode == "WorkOFF") {
      digitalWrite(LED_GREEN, LOW);
      digitalWrite(LED_YELLOW, LOW);
      digitalWrite(LED_RED, LOW);
    } else if (mode == "WorkON") {
      digitalWrite(LED_GREEN, HIGH);
      digitalWrite(LED_YELLOW, LOW);
      digitalWrite(LED_RED, LOW);
    } else if (mode == "Working") {
      digitalWrite(LED_GREEN, LOW);
      digitalWrite(LED_YELLOW, HIGH);
      digitalWrite(LED_RED, lastAlertSent ? HIGH : LOW);
    }

    // debug
    Serial.print("RAW HR: ");
    Serial.print(rawHR);
    Serial.print(" | EMA HR: ");
    Serial.print(hrForLogic);
    Serial.print(" | RAW Dist: ");
    Serial.print(rawDist);
    Serial.print(" | EMA Dist: ");
    Serial.print(distForLogic);
    Serial.print(" | Mode: ");
    Serial.println(mode);

    lastMode = mode;
  }
}

// ============ FUNÇÕES ============

void setup_wifi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.print("Conectando ao WiFi: ");
  Serial.println(ssid);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  Serial.println();
  if (WiFi.isConnected()) {
    Serial.print("WiFi conectado. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Falha ao conectar WiFi (continua sem internet).");
  }
}

void reconnect_mqtt() {
  int attempt = 0;
  while (!client.connected()) {
    attempt++;
    Serial.print("Tentando conectar ao MQTT (tentativa ");
    Serial.print(attempt);
    Serial.println(") ...");

    String clientId = "EloyBand_ESP32_" + String((uint32_t)esp_random(), HEX);
    if (client.connect(clientId.c_str())) {
      Serial.println("MQTT conectado!");
      client.subscribe("eloy/band01/commands");
      break;
    } else {
      Serial.print("Falha MQTT, rc=");
      Serial.print(client.state());
      Serial.println(" -> retry em 3s");
      delay(3000);
    }
  }
}

void publishData(int hr, float distance, const String &mode) {
  if (!client.connected()) return;

  // construir JSON com ArduinoJson
  StaticJsonDocument<256> doc;
  doc["device"] = "eloyband_01";
  doc["heart_rate"] = hr;
  if (distance >= 900) {
    doc["distance_cm"] = nullptr; // inválido -> null
  } else {
    doc["distance_cm"] = (int)round(distance);
  }
  doc["mode"] = mode;
  // timestamp em epoch se possível
  unsigned long ts = getEpoch();
  doc["timestamp"] = ts;

  char buffer[256];
  size_t n = serializeJson(doc, buffer);
  bool ok = client.publish(topic_data, buffer, n);
  if (ok) {
    Serial.print("Publicado DATA: ");
    Serial.println(buffer);
  } else {
    Serial.println("Falha ao publicar dados MQTT");
  }
}

void publishAlert(const String &msg) {
  if (!client.connected()) return;
  bool ok = client.publish(topic_alerts, msg.c_str());
  if (ok) {
    Serial.print("ALERTA PUBLICADO: ");
    Serial.println(msg);
  } else {
    Serial.println("Falha ao publicar alerta MQTT");
  }
}

// Leitura do potenciômetro -> HR (0 ou 60..120)
int readRawHeartRate() {
  int raw = analogRead(POTENTIOMETER_PIN); // 0..4095
  if (raw < 100) return 0; // threshold para WorkOFF
  int hr = map(raw, 100, 4095, 60, 120);
  hr = constrain(hr, 60, 120);
  return hr;
}

// Leitura do HC-SR04 (em cm). Retorna 999 se inválido (timeout).
float readRawDistance() {
  // trigger
  digitalWrite(TRIGGER_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIGGER_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIGGER_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // timeout 30ms -> ~5m
  if (duration <= 0) {
    return 999; // inválido
  }
  float distance = (duration * 0.0343) / 2.0; // cm
  if (distance < 0 || distance > 400) return 999;
  return distance;
}

String calcularModo(int hr, float distance) {
  // Lógica baseada no Python enviado:
  // if hr == 0 -> WorkOFF
  // if hr > 0 and dist > 50 -> WorkON
  // if hr > 0 and dist <= 50 -> Working
  if (hr == 0) return "WorkOFF";

  // tratar distância inválida como muito longe (WorkON)
  if (distance >= 900) {
    return "WorkON";
  }

  if (hr > 0 && distance > 50.0) return "WorkON";
  if (hr > 0 && distance <= 50.0) return "Working";
  return "WorkOFF";
}

unsigned long getEpoch() {
  time_t now;
  time(&now);
  if (now < 1600000000UL) { // se NTP não trouxe data válida (antes de 2020)
    // fallback para millis (não é epoch real)
    return millis() / 1000UL;
  }
  return (unsigned long)now;
}
