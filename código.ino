/*
 * Projeto: Band de Monitoramento de Produtividade e Bem-Estar (Controle de Fadiga/Overworking)
 * Dispositivo: ESP32 (Simulado no Wokwi)
 * Comunicação: MQTT
 * Tópico de Publicação: manus/employee/status
 *
 * Lógica de Estado (Edge Computing):
 * 1. WORK_OFF: BPM = 0 (Band não está sendo usada)
 * 2. WORK_ON: BPM > 0 E Distância > 50cm (Funcionário presente, mas não na estação de trabalho)
 * 3. WORKING: BPM > 0 E Distância <= 50cm (Funcionário na estação de trabalho)
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// --- Configurações de Rede e MQTT ---
const char* ssid = "Wokwi-WiFi";
const char* password = "";
const char* mqtt_server = "broker.emqx.io";
const int mqtt_port = 1883;
const char* mqtt_topic = "manus/employee/status";
const char* clientID = "ESP32_Band_02";
const char* employeeID = "user_01";

WiFiClient espClient;
PubSubClient client(espClient);

// --- Lógica de Sensores e Estado ---
enum Mode { WORK_OFF, WORK_ON, WORKING };
Mode currentMode = WORK_OFF;
unsigned long modeStartTime = 0;

// Variáveis para simular a leitura dos sensores
int simulatedBPM = 0; // Batimentos por minuto
int simulatedDistanceCm = 100; // Distância da Band ao Beacon (em cm)

const int WORKING_DISTANCE_THRESHOLD = 50; // 50cm

// Função para simular a leitura dos sensores
void readSimulatedSensors() {
  // Simulação de BPM:
  // 0 BPM: Band não está sendo usada (WORK_OFF)
  // 60-100 BPM: Band está sendo usada (WORK_ON/WORKING)
  if (random(0, 10) < 2) { // 20% de chance de "tirar" a band
    simulatedBPM = 0;
  } else {
    simulatedBPM = random(60, 101);
  }

  // Simulação de Distância:
  // Se BPM > 0, simula a distância (50% de chance de estar perto)
  if (simulatedBPM > 0) {
    if (random(0, 10) < 5) {
      simulatedDistanceCm = random(10, WORKING_DISTANCE_THRESHOLD + 10); // Perto (<= 60cm)
    } else {
      simulatedDistanceCm = random(WORKING_DISTANCE_THRESHOLD + 1, 200); // Longe (> 50cm)
    }
  } else {
    simulatedDistanceCm = 999; // Irrelevante se não estiver sendo usada
  }
}

// Função de Lógica de Decisão (Edge Computing)
void updateMode() {
  Mode newMode;

  if (simulatedBPM == 0) {
    newMode = WORK_OFF;
  } else if (simulatedDistanceCm <= WORKING_DISTANCE_THRESHOLD) {
    newMode = WORKING;
  } else {
    newMode = WORK_ON;
  }

  if (currentMode != newMode) {
    currentMode = newMode;
    modeStartTime = millis();
    Serial.print("Modo alterado para: ");
    Serial.println(getModeName(currentMode));
  }
}

// Função para obter o nome do modo atual
String getModeName(Mode mode) {
  switch (mode) {
    case WORK_OFF: return "WORK_OFF";
    case WORK_ON: return "WORK_ON";
    case WORKING: return "WORKING";
    default: return "UNKNOWN";
  }
}

// Função para publicar o status via MQTT
void publishStatus() {
  unsigned long timeInModeMs = millis() - modeStartTime;
  long timeInModeSec = timeInModeMs / 1000;

  StaticJsonDocument<200> doc;
  doc["employee_id"] = employeeID;
  doc["current_mode"] = getModeName(currentMode);
  doc["time_in_mode_sec"] = timeInModeSec;
  doc["bpm"] = simulatedBPM; // Inclui BPM e Distância para o dashboard
  doc["distance_cm"] = simulatedDistanceCm;

  char jsonBuffer[200];
  serializeJson(doc, jsonBuffer);

  client.publish(mqtt_topic, jsonBuffer);
  Serial.print("Status publicado: ");
  Serial.println(jsonBuffer);
}

// --- Funções de Rede ---

void setup_wifi() {
  delay(10);
  Serial.print("Conectando a ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado");
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Tentando conexão MQTT...");
    if (client.connect(clientID)) {
      Serial.println("conectado");
    } else {
      Serial.print("falhou, rc=");
      Serial.print(client.state());
      Serial.println(" Tentando novamente em 5 segundos");
      delay(5000);
    }
  }
}

// --- Setup e Loop ---

void setup() {
  Serial.begin(115200);
  setup_wifi();
  client.setServer(mqtt_server, mqtt_port);
  modeStartTime = millis(); // Inicializa o tempo
  Serial.println("\nMonitoramento de Produtividade Ativo.");
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // A cada 5 segundos, lê os sensores, atualiza o modo e publica
  static unsigned long lastUpdate = 0;
  if (millis() - lastUpdate > 5000) {
    lastUpdate = millis();
    readSimulatedSensors();
    updateMode();
    publishStatus();
  }
}
