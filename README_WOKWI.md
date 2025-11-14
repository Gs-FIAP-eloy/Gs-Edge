# EloyBand - Simulação Wokwi

Simulação de uma pulseira inteligente para monitoramento de funcionários com detecção de frequência cardíaca e proximidade via MQTT.

## 📋 Estrutura do Projeto

```
eloyband-wokwi/
├── sketch.ino              # Código principal do ESP32
├── diagram.json            # Configuração dos componentes
├── libraries.txt           # Dependências
└── README.md              # Este arquivo
```

## 🔧 Componentes Utilizados

| Componente | Pino ESP32 | Função |
|-----------|-----------|--------|
| **Potenciômetro** | GPIO 34 | Simula sensor de frequência cardíaca (HR) |
| **HC-SR04 (Trigger)** | GPIO 5 | Sensor ultrassônico - Trigger |
| **HC-SR04 (Echo)** | GPIO 18 | Sensor ultrassônico - Echo (distância) |
| **LED Verde** | GPIO 25 | Indicador de WorkOFF |
| **LED Amarelo** | GPIO 26 | Indicador de WorkON |
| **LED Vermelho** | GPIO 27 | Indicador de Working |

## 🚀 Como Usar no Wokwi

### 1. Criar um novo projeto no Wokwi
- Acesse [wokwi.com](https://wokwi.com)
- Clique em "New Project"
- Selecione "ESP32"

### 2. Copiar os arquivos
- **sketch.ino**: Cole o código C++ fornecido
- **diagram.json**: Substitua o arquivo diagram.json existente
- **libraries.txt**: Cole as dependências

### 3. Configurar as bibliotecas
O Wokwi carregará automaticamente:
- `WiFi` (padrão)
- `PubSubClient` (para MQTT)
- `ArduinoJson` (para JSON)

### 4. Executar a simulação
- Clique em "Start Simulation"
- Abra o Serial Monitor (Ctrl+Shift+M)
- Veja os dados sendo publicados em tempo real

## 📊 Lógica de Estados

A pulseira detecta três estados baseado em:
- **Frequência Cardíaca (HR)**: Lida do potenciômetro (60-120 bpm)
- **Distância**: Lida do sensor HC-SR04 (em cm)

| Estado | Condição | LED |
|--------|----------|-----|
| **WorkOFF** | HR = 0 (parado) | Verde |
| **WorkON** | HR > 0 E Distância ≥ 30cm | Amarelo |
| **Working** | HR > 0 E Distância < 30cm | Vermelho |

## 📡 Publicação MQTT

### Tópico de Dados: `eloy/band01/data`
```json
{
  "device": "eloyband_01",
  "heart_rate": 85,
  "distance_cm": 15,
  "mode": "Working",
  "timestamp": 12345678
}
```

### Tópico de Alertas: `eloy/band01/alerts`
```
OVERWORKING DETECTED - High heart rate in working mode!
```

**Condição de Alerta:**
- Modo = "Working" por mais de 5 segundos
- Chance aleatória de 30% a cada leitura

## 🎮 Simulando Comportamentos

### Simular WorkOFF
- Mova o potenciômetro para a esquerda (valor baixo)
- HR = 0 → LED Verde acende

### Simular WorkON
- Mova o potenciômetro para o meio (valor médio)
- Mantenha o sensor ultrassônico a mais de 30cm
- HR > 0 E Distância > 30cm → LED Amarelo acende

### Simular Working
- Mova o potenciômetro para a direita (valor alto)
- Aproxime a mão do sensor ultrassônico (< 30cm)
- HR > 0 E Distância < 30cm → LED Vermelho acende

### Gerar Alerta
- Mantenha o modo "Working" por mais de 5 segundos
- Aguarde a chance aleatória de 30%
- Alerta será publicado em `eloy/band01/alerts`

## 🐍 Consumir Dados com Python

Use o script fornecido para receber os dados:

```python
import paho.mqtt.client as mqtt
import json

BROKER = "broker.emqx.io"
PORT = 1883
TOPIC_DATA = "eloy/band01/data"
TOPIC_ALERTS = "eloy/band01/alerts"

def on_connect(client, userdata, flags, rc):
    print("Conectado ao broker:", rc)
    client.subscribe(TOPIC_DATA)
    client.subscribe(TOPIC_ALERTS)

def on_message(client, userdata, msg):
    try:
        if msg.topic == TOPIC_DATA:
            data = json.loads(msg.payload.decode())
            print("[DATA]", data)
        else:
            print("[ALERTA]", msg.payload.decode())
    except Exception as e:
        print("Erro ao processar mensagem:", e)

client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message

client.connect(BROKER, PORT, 60)
client.loop_forever()
```

## 🔍 Monitorar no Serial

O Serial Monitor mostrará:
```
HR: 85 bpm | Dist: 15 cm | Mode: Working
Publicado: {"device":"eloyband_01","heart_rate":85,"distance_cm":15,"mode":"Working","timestamp":12345}
```

## 🐛 Troubleshooting

### WiFi não conecta
- Verifique se está usando "Wokwi-GUEST" como SSID
- O Wokwi simula WiFi automaticamente

### MQTT não publica
- Verifique a conexão com broker.emqx.io:1883
- Confira os tópicos: `eloy/band01/data` e `eloy/band01/alerts`
- Veja os logs no Serial Monitor

### Sensor ultrassônico não funciona
- Verifique os pinos: Trigger=5, Echo=18
- Certifique-se de que o HC-SR04 está conectado a 5V

## 📚 Referências

- [Wokwi Documentation](https://docs.wokwi.com)
- [PubSubClient Library](https://github.com/knolleary/pubsubclient)
- [EMQX Broker](https://www.emqx.io)
- [Arduino JSON Library](https://arduinojson.org)

## 📝 Notas Importantes

1. **Limitações do Wokwi**: A biblioteca PubSubClient funciona sem `setClient()` ou `state()`
2. **JSON Manual**: Os dados são publicados como strings JSON (não usa ArduinoJson para publicação)
3. **Intervalo de Publicação**: 2 segundos entre cada leitura
4. **Broker Público**: O broker.emqx.io é público e gratuito para testes

---

**Desenvolvido para projeto de monitoramento de funcionários EloyBand** 🎯
