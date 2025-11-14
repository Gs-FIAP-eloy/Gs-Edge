# 🚀 Guia de Setup - EloyBand no Wokwi

## Passo 1: Acessar o Wokwi

1. Abra [https://wokwi.com](https://wokwi.com)
2. Faça login ou crie uma conta (gratuito)
3. Clique em **"New Project"**
4. Selecione **"ESP32"** como plataforma

## Passo 2: Configurar o Código

1. Na aba **"Code"**, você verá um arquivo `sketch.ino`
2. **Apague todo o conteúdo** e cole o código fornecido:
   - Copie todo o conteúdo de `eloyband_wokwi.cpp`
   - Cole em `sketch.ino`
   - Salve (Ctrl+S)

## Passo 3: Configurar os Componentes

1. Na aba **"Diagram"**, você verá um arquivo `diagram.json`
2. **Apague todo o conteúdo** e cole:
   - Copie todo o conteúdo de `diagram.json`
   - Cole no arquivo `diagram.json` do Wokwi
   - Salve (Ctrl+S)

3. A simulação deve mostrar:
   - ✅ ESP32 DevKit V1
   - ✅ Potenciômetro (para HR)
   - ✅ HC-SR04 (sensor ultrassônico)
   - ✅ 3 LEDs (verde, amarelo, vermelho)

## Passo 4: Configurar as Bibliotecas

1. Clique em **"Libraries"** ou procure por `libraries.txt`
2. Adicione as seguintes bibliotecas:
   ```
   WiFi
   PubSubClient
   ArduinoJson
   ```

3. O Wokwi carregará automaticamente. Se não carregar:
   - Clique em **"Add Library"**
   - Procure por "PubSubClient"
   - Selecione a versão mais recente

## Passo 5: Executar a Simulação

1. Clique em **"Start Simulation"** (botão verde ▶️)
2. Aguarde o ESP32 inicializar (pode levar 5-10 segundos)
3. Abra o **Serial Monitor** (Ctrl+Shift+M)

Você deve ver:
```
========================================
    EloyBand - Wokwi Simulation
========================================
Conectando ao WiFi: Wokwi-GUEST
.....
WiFi conectado!
IP: 10.0.0.x
Tentando conectar ao MQTT...
Conectado!
Setup completo!
```

## Passo 6: Testar os Sensores

### Teste 1: Potenciômetro (HR)
1. Clique no potenciômetro na simulação
2. Arraste para a **esquerda** (valor baixo)
   - Serial deve mostrar: `HR: 0 bpm | Mode: WorkOFF`
3. Arraste para o **meio** (valor médio)
   - Serial deve mostrar: `HR: ~90 bpm | Mode: WorkON` (se distância > 30cm)
4. Arraste para a **direita** (valor alto)
   - Serial deve mostrar: `HR: ~120 bpm`

### Teste 2: Sensor Ultrassônico (Distância)
1. Clique no HC-SR04 na simulação
2. Você verá um **cursor de distância**
3. Arraste para **perto** (< 30cm)
   - Se HR > 0: `Mode: Working` (LED vermelho acende)
4. Arraste para **longe** (> 30cm)
   - Se HR > 0: `Mode: WorkON` (LED amarelo acende)

### Teste 3: Alerta de Overworking
1. Coloque em modo **Working** (HR alto + Distância baixa)
2. Mantenha por **mais de 5 segundos**
3. Aguarde a chance aleatória (30%)
4. Você verá no Serial:
   ```
   ALERTA PUBLICADO: OVERWORKING DETECTED - High heart rate in working mode!
   ```

## Passo 7: Verificar Publicação MQTT

No Serial Monitor, você deve ver mensagens como:
```
Publicado: {"device":"eloyband_01","heart_rate":85,"distance_cm":15,"mode":"Working","timestamp":12345}
```

Isso significa que os dados estão sendo enviados para:
- **Tópico**: `eloy/band01/data`
- **Broker**: `broker.emqx.io:1883`

## Passo 8: Receber Dados com Python

Execute seu script Python em outro terminal:
```bash
python seu_script.py
```

Você deve ver:
```
Conectado ao broker: 0
[DATA] {'device': 'eloyband_01', 'heart_rate': 85, 'distance_cm': 15, 'mode': 'Working', 'timestamp': 12345}
[ALERTA] OVERWORKING DETECTED - High heart rate in working mode!
```

## ✅ Checklist de Verificação

- [ ] Código C++ carregado em `sketch.ino`
- [ ] `diagram.json` configurado com todos os componentes
- [ ] Bibliotecas instaladas (WiFi, PubSubClient, ArduinoJson)
- [ ] Simulação iniciada e conectada ao WiFi
- [ ] Serial Monitor mostrando dados
- [ ] Potenciômetro alterando HR
- [ ] HC-SR04 alterando distância
- [ ] LEDs acendendo conforme o modo
- [ ] Dados sendo publicados no MQTT
- [ ] Python recebendo dados do broker

## 🎯 Próximas Etapas

1. **Implementar no hardware real**: Transfira o código para um ESP32 físico
2. **Adicionar mais sensores**: Temperatura, umidade, acelerómetro
3. **Criar dashboard**: Use o dashboard React que já foi desenvolvido
4. **Banco de dados**: Armazene os dados em um banco de dados

## 🆘 Precisa de Ajuda?

Se algo não funcionar:
1. Verifique o Serial Monitor para mensagens de erro
2. Confirme que todos os pinos estão corretos
3. Reinicie a simulação (Stop → Start)
4. Limpe o cache do navegador (Ctrl+Shift+Delete)

---

**Pronto para começar!** 🚀
