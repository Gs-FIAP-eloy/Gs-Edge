#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// --- Configurações de Rede ---
const char* default_SSID = "Wokwi-GUEST";
const char* default_PASSWORD = "";

// --- Configurações do MQTT ---
const char* default_BROKER_MQTT = "44.223.43.74"; 
const int default_BROKER_PORT = 1883; 
const char* DEVICE_ID = "device023"; 

const char* TOPICO_PUBLISH_HR = "TEF/device023/attrs/b"; 
const char* TOPICO_PUBLISH_DISTANCE = "TEF/device023/attrs/d"; 
const char* TOPICO_SUBSCRIBE = "TEF/device023/cmd"; 

// --- Configurações dos Pinos ---
const int POT_PIN_HR = 34; // Potenciômetro para Batimentos Cardíacos
const int TRIG_PIN = 5;  // Pino TRIG do HC-SR04
const int ECHO_PIN = 18; // Pino ECHO do HC-SR04

// --- Protótipos de Funções ---
void initSerial();
void reconectWiFi();
void reconnectMQTT();
void mqtt_callback(char* topic, byte* payload, unsigned int length);
void VerificaConexoesWiFIEMQTT();
void sendSensorDataMQTT();

// --- Variáveis Globais ---
WiFiClient espClient;
PubSubClient MQTT(espClient);

// --- Funções de Leitura de Sensores ---

int readHeartRate() {
    int sensorValue = analogRead(POT_PIN_HR);
    int heartRate = map(sensorValue, 0, 4095, 0, 200);
    return heartRate;
}

float readDistance() {
    // Envia pulso de 10us no pino TRIG
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    
    // Lê o tempo de resposta no pino ECHO
    long duration = pulseIn(ECHO_PIN, HIGH, 30000); // timeout de 30ms
    
    // Calcula a distância em metros
    // Velocidade do som = 343 m/s = 0.0343 cm/us
    // Distância = (tempo * velocidade) / 2 (ida e volta)
    float distance = (duration * 0.0343) / 2.0 / 100.0; // Converte para metros
    
    // Limita o valor entre 0 e 4 metros (range típico do HC-SR04)
    if (distance > 4.0 || distance <= 0) {
        distance = 0.0;
    }
    
    return distance;
}

// --- Funções de Conexão ---

void initSerial() {
    Serial.begin(115200);
}

void reconectWiFi() {
    if (WiFi.status() == WL_CONNECTED)
        return;
        
    WiFi.begin(default_SSID, default_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) {
        delay(100);
        Serial.print(".");
    }
    
    Serial.println();
    Serial.println("Conectado com sucesso na rede!");
    Serial.print("IP obtido: ");
    Serial.println(WiFi.localIP());
}

void reconnectMQTT() {
    while (!MQTT.connected()) {
        Serial.print("* Tentando se conectar ao Broker MQTT: ");
        Serial.println(default_BROKER_MQTT);
        if (MQTT.connect(DEVICE_ID)) { 
            Serial.println("Conectado com sucesso ao broker MQTT!");
            MQTT.subscribe(TOPICO_SUBSCRIBE); 
        } else {
            Serial.println("Falha ao reconectar no broker.");
            Serial.println("Haverá nova tentativa de conexão em 2s");
            delay(2000);
        }
    }
}

void mqtt_callback(char* topic, byte* payload, unsigned int length) {
    String msg;
    for (int i = 0; i < length; i++) {
        char c = (char)payload[i];
        msg += c;
    }
    Serial.print("- Mensagem recebida no tópico ");
    Serial.print(topic);
    Serial.print(": ");
    Serial.println(msg);
}

void VerificaConexoesWiFIEMQTT() {
    reconectWiFi();
    if (!MQTT.connected())
        reconnectMQTT();
}

// --- Funções de Envio de Dados ---

void sendSensorDataMQTT() {
    // Envia Batimentos Cardíacos
    int heartRate = readHeartRate();
    String hr_msg = String(heartRate);
    MQTT.publish(TOPICO_PUBLISH_HR, hr_msg.c_str());
    Serial.print("Batimentos enviados para ");
    Serial.print(TOPICO_PUBLISH_HR);
    Serial.print(": ");
    Serial.println(hr_msg);
    
    // Envia Distância
    float distance = readDistance();
    String dist_msg = String(distance, 2); // 2 casas decimais
    MQTT.publish(TOPICO_PUBLISH_DISTANCE, dist_msg.c_str());
    Serial.print("Distância enviada para ");
    Serial.print(TOPICO_PUBLISH_DISTANCE);
    Serial.print(": ");
    Serial.print(dist_msg);
    Serial.println(" m");
}

// --- Setup e Loop ---

void setup() {
    initSerial();
    
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);
    
    MQTT.setServer(default_BROKER_MQTT, default_BROKER_PORT);
    MQTT.setCallback(mqtt_callback);
    
    reconectWiFi();
    reconnectMQTT();
    
    Serial.println("\n=== Sketch IoT Band - Sensores MQTT ===");
    delay(2000);
}

void loop() {
    VerificaConexoesWiFIEMQTT();
    MQTT.loop(); 
    
    sendSensorDataMQTT();
    
    delay(5000); // Envia a cada 5 segundos
}
