#include <WiFi.h>
#include <PubSubClient.h>

// ================= CONFIGURAÇÕES EDITÁVEIS =================
const char* SSID        = "Wokwi-GUEST";       // Nome da rede Wi-Fi
const char* PASSWORD    = "";                  // Senha do Wi-Fi
const char* BROKER_MQTT = "test.mosquitto.org"; // Broker MQTT público
const int   BROKER_PORT = 1883;

// ================= PINOS DO HARDWARE =================
// Simulação de sensores
#define SENSOR_BATIMENTOS 34 // Simula batimentos cardíacos (0 = não detectado, >0 = detectado)
#define SENSOR_PROXIMIDADE 35 // Simula distância ao beacon (0-100)

// LEDs para feedback (opcional)
#define LED_STATUS 2

// ================= TÓPICOS MQTT =================
const char* TOPICO_STATUS   = "produtividade/band1/status";   // Publica estado atual
const char* TOPICO_ALERTAS  = "produtividade/band1/alertas"; // Publica alertas Overworking ou WorkON < meta
const char* TOPICO_COMANDOS = "produtividade/band1/comandos";// Recebe comandos do dashboard

// ================= OBJETOS =================
WiFiClient espClient;
PubSubClient MQTT(espClient);

// ================= VARIÁVEIS DE ESTADO =================
enum Modo { WorkOFF, WorkON, Working, Overworking };
Modo modoAtual = WorkOFF;

int batimentos = 0;     // Valor do sensor de batimentos
int proximidade = 0;    // Distância do beacon (cm)
unsigned long tempoModoWorking = 0;   // Contagem do tempo em Working
const unsigned long LIMITE_OVERWORKING = 2 * 60 * 1000; // 2 minutos para teste
const int META_HORAS_DIARIAS = 8;     // Meta de horas de trabalho (simulada)

// ================= FUNÇÕES AUXILIARES =================
void initWiFi() {
  Serial.print("Conectando à rede Wi-Fi: ");
  Serial.println(SSID);
  WiFi.begin(SSID, PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.println("✅ Wi-Fi conectado!");
  Serial.print("IP: "); Serial.println(WiFi.localIP());
}

void initMQTT() {
  MQTT.setServer(BROKER_MQTT, BROKER_PORT);
  MQTT.setCallback(callback);
}

void reconnectMQTT() {
  while (!MQTT.connected()) {
    Serial.print("Conectando ao Broker MQTT...");
    if (MQTT.connect("band1_ESP32")) {
      Serial.println("Conectado!");
      MQTT.subscribe(TOPICO_COMANDOS);
    } else {
      Serial.print("Falha. Erro=");
      Serial.println(MQTT.state());
      delay(2000);
    }
  }
}

void callback(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  msg.trim();
  Serial.print("Mensagem recebida: "); Serial.println(msg);

  if (msg.equals("reset")) {
    modoAtual = WorkOFF;
    tempoModoWorking = 0;
    Serial.println("✅ Estado resetado!");
  }
}

// ================= FUNÇÃO DE LEITURA DE SENSORES (simulada) =================
void lerSensores() {
  batimentos = analogRead(SENSOR_BATIMENTOS);       // 0 = WorkOFF, >0 = WorkON
  proximidade = analogRead(SENSOR_PROXIMIDADE)/40;  // Converte 0-4095 para 0-100 cm aproximado
}

// ================= FUNÇÃO PARA DEFINIR O MODO =================
void atualizarModo() {
  if (batimentos == 0) {
    modoAtual = WorkOFF;
    tempoModoWorking = 0;
  } else if (batimentos > 0 && proximidade > 50) {
    modoAtual = WorkON;
    tempoModoWorking = 0;
  } else if (batimentos > 0 && proximidade <= 50) {
    modoAtual = Working;
    tempoModoWorking += 1000; // 1 segundo por loop aproximado
    // Verifica Overworking
    if (tempoModoWorking >= LIMITE_OVERWORKING) {
      modoAtual = Overworking;
      String alerta = "⚠️ Overworking detectado!";
      MQTT.publish(TOPICO_ALERTAS, alerta.c_str());
    }
  }
}

// ================= FUNÇÃO PARA ENVIAR STATUS =================
void enviarStatus() {
  String payload = "{";
  payload += "\"modo\":\"";
  switch(modoAtual) {
    case WorkOFF: payload += "WorkOFF"; break;
    case WorkON: payload += "WorkON"; break;
    case Working: payload += "Working"; break;
    case Overworking: payload += "Overworking"; break;
  }
  payload += "\",\"batimentos\":" + String(batimentos);
  payload += ",\"proximidade\":" + String(proximidade);
  payload += "}";
  MQTT.publish(TOPICO_STATUS, payload.c_str());
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);
  pinMode(LED_STATUS, OUTPUT);
  initWiFi();
  initMQTT();
  reconnectMQTT();
  Serial.println("Sistema de produtividade iniciado!");
}

// ================= LOOP PRINCIPAL =================
void loop() {
  if (WiFi.status() != WL_CONNECTED) initWiFi();
  if (!MQTT.connected()) reconnectMQTT();
  MQTT.loop();

  lerSensores();
  atualizarModo();
  enviarStatus();

  digitalWrite(LED_STATUS, modoAtual != WorkOFF ? HIGH : LOW);
  delay(1000); // Envia status a cada 1 segundo (ajuste conforme necessário)
}
