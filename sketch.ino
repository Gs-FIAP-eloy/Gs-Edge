#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// --- Configurações de Rede ---
// Use "Wokwi-GUEST" e "" para simulação no Wokwi
const char* default_SSID = "Wokwi-GUEST"; // Nome da rede Wi-Fi
const char* default_PASSWORD = ""; // Senha da rede Wi-Fi

// --- Configurações do MQTT (Extraídas do seu Backend) ---
// O backend espera o broker em 44.223.43.74
const char* default_BROKER_MQTT = "44.223.43.74"; 
const int default_BROKER_PORT = 1883; 

// O backend espera que os dados de distância (d) e batimentos (b) venham do device023
const char* DEVICE_ID = "device023"; 

// Tópicos de Publicação (O backend escuta por tópicos terminados em /d e /b)
// O backend usa o tópico TEF/device023/attrs/d para distância (d)
const char* TOPICO_PUBLISH_DIST = "TEF/device023/attrs/d"; 
// O backend usa o tópico TEF/device023/attrs/b para batimentos (b)
const char* TOPICO_PUBLISH_HR = "TEF/device023/attrs/b"; 

// Tópico de Escuta (para comandos, se necessário)
const char* TOPICO_SUBSCRIBE = "TEF/device023/cmd"; 

// --- Configurações dos Pinos ---
// Sensor Ultrassônico HC-SR04
const int TRIG_PIN = 5; // Pino TRIG do sensor (Exemplo: GPIO 5)
const int ECHO_PIN = 18; // Pino ECHO do sensor (Exemplo: GPIO 18)

// Potenciômetro (Simulação de Batimentos Cardíacos)
const int POT_PIN = 34; // Pino analógico para o potenciômetro (GPIO 34)

// --- Protótipos de Funções ---
void initUltrasonicSensor();
void initSerial();
void reconectWiFi();
void reconnectMQTT();
void mqtt_callback(char* topic, byte* payload, unsigned int length);
void VerificaConexoesWiFIEMQTT();
void sendSensorDataMQTT();

// --- Variáveis Globais ---
WiFiClient espClient;
PubSubClient MQTT(espClient);
long duration;
int distanceCm;

// --- Funções de Leitura de Sensores ---

void initUltrasonicSensor() {
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);
    digitalWrite(TRIG_PIN, LOW);
}

int readHeartRate() {
    // Lê o valor analógico do potenciômetro (0 a 4095 no ESP32)
    int sensorValue = analogRead(POT_PIN);
    
    // Mapeia o valor lido para um range de batimentos cardíacos (exemplo: 0 a 200 BPM)
    int heartRate = map(sensorValue, 0, 4095, 0, 200);
    
    return heartRate;
}

int readUltrasonicDistance() {
    // Limpa o pino Trig
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    
    // Seta o pino Trig em HIGH por 10 microsegundos
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    
    // Lê o pino Echo, retorna a duração da onda sonora em microsegundos
    duration = pulseIn(ECHO_PIN, HIGH);
    
    // Calcula a distância em cm (velocidade do som: 343 m/s ou 0.0343 cm/us)
    // Distância = (Duração * Velocidade do Som) / 2
    distanceCm = duration * 0.0343 / 2;
    
    // Garante que a distância não seja negativa
    if (distanceCm < 0) {
        distanceCm = 0;
    }
    
    return distanceCm;
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
        // Usa o DEVICE_ID como ID do cliente MQTT
        if (MQTT.connect(DEVICE_ID)) { 
            Serial.println("Conectado com sucesso ao broker MQTT!");
            // Inscreve-se no tópico de comandos
            MQTT.subscribe(TOPICO_SUBSCRIBE); 
        } else {
            Serial.println("Falha ao reconectar no broker.");
            Serial.println("Haverá nova tentativa de conexão em 2s");
            delay(2000);
        }
    }
}

void mqtt_callback(char* topic, byte* payload, unsigned int length) {
    // Função de callback para receber comandos do broker (mantida por compatibilidade)
    String msg;
    for (int i = 0; i < length; i++) {
        char c = (char)payload[i];
        msg += c;
    }
    Serial.print("- Mensagem recebida no tópico ");
    Serial.print(topic);
    Serial.print(": ");
    Serial.println(msg);
    
    // Adicione aqui a lógica para processar comandos, se necessário
}

void VerificaConexoesWiFIEMQTT() {
    reconectWiFi();
    if (!MQTT.connected())
        reconnectMQTT();
}

// --- Funções de Envio de Dados ---

void sendSensorDataMQTT() {
    int heartRate = readHeartRate();
    int distance = readUltrasonicDistance();
    
    // 1. Envia Batimentos Cardíacos (Tópico /b)
    String hr_msg = String(heartRate);
    MQTT.publish(TOPICO_PUBLISH_HR, hr_msg.c_str());
    Serial.print("Batimentos (Potenciômetro) enviados para ");
    Serial.print(TOPICO_PUBLISH_HR);
    Serial.print(": ");
    Serial.println(hr_msg);
    
    // 2. Envia Distância Ultrassônica (Tópico /d)
    String dist_msg = String(distance);
    MQTT.publish(TOPICO_PUBLISH_DIST, dist_msg.c_str());
    Serial.print("Distância (cm) enviada para ");
    Serial.print(TOPICO_PUBLISH_DIST);
    Serial.print(": ");
    Serial.println(dist_msg);
}

// --- Setup e Loop ---

void setup() {
    initSerial();
    
    // Configurações do MQTT
    MQTT.setServer(default_BROKER_MQTT, default_BROKER_PORT);
    MQTT.setCallback(mqtt_callback);
    
    // Inicialização dos Sensores
    initUltrasonicSensor();
    
    // Conexão inicial
    reconectWiFi();
    reconnectMQTT();
    
    Serial.println("\n=== Sketch IoT Band - MQTT Backend Integrado ===");
    delay(2000);
}

void loop() {
    VerificaConexoesWiFIEMQTT();
    
    // Processa mensagens MQTT recebidas (para comandos)
    MQTT.loop(); 
    
    // Envia os dados dos sensores
    sendSensorDataMQTT();
    
    // Aguarda antes da próxima leitura/envio
    delay(5000); // Envia a cada 5 segundos
}
