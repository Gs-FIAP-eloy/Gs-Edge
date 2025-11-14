# IoT Band Data Backend

Backend Python independente que processa dados de uma banda IoT via MQTT e expõe uma API REST para consumo pelo dashboard React.

## Arquitetura

```
Simulador Python (seu código)
    ↓ (publica dados via MQTT)
    ↓
Broker MQTT (44.223.43.74:1883)
    ↓ (subscreve dados)
    ↓
Backend Python (Render) - Processa dados, rastreia tempo, gera alertas
    ↓ (expõe via API REST)
    ↓
Dashboard React (seu frontend) - Consome via fetch/axios
```

## Componentes

### 1. `mqtt_processor.py`
Módulo principal que:
- Conecta ao broker MQTT
- Recebe dados da banda (frequência cardíaca, distância)
- Rastreia tempo acumulado em cada estado (WorkOFF, WorkON, WORKING)
- Implementa lógica de alertas:
  - **Overworking**: Alerta quando o usuário fica muito tempo em estado WORKING (padrão: 1 hora)
  - **Baixa Produtividade**: Alerta quando tempo em WorkON é muito maior que em WORKING (padrão: 2x)

### 2. `api.py`
API REST em FastAPI que expõe os seguintes endpoints:

#### Health & Status
- `GET /health` - Verifica se a API está rodando
- `GET /status` - Status da conexão MQTT

#### Data Endpoints
- `GET /api/band/current` - Estado atual da banda
- `GET /api/band/statistics` - Estatísticas de uso
- `GET /api/band/alerts` - Alertas ativos
- `GET /api/band/alerts/history` - Histórico de alertas

#### Control Endpoints
- `POST /api/band/reset` - Reseta contadores e alertas

## Instalação Local

### Pré-requisitos
- Python 3.8+
- pip

### Setup

1. **Clone/copie os arquivos**
```bash
# Copie os arquivos para seu projeto
cp mqtt_processor.py seu_projeto/
cp api.py seu_projeto/
cp requirements.txt seu_projeto/
```

2. **Instale as dependências**
```bash
pip install -r requirements.txt
```

3. **Configure as variáveis de ambiente**
```bash
# Copie o arquivo de exemplo
cp .env.example .env

# Edite .env com seus valores (ou use os padrões)
```

4. **Execute a API**
```bash
python api.py
```

A API estará disponível em `http://localhost:8000`

## Uso

### 1. Iniciar o Simulador (seu código Python)
```bash
python seu_simulador.py
```

Isso publicará dados no tópico MQTT `TEF/device023/attrs/d`

### 2. Iniciar o Backend
```bash
python api.py
```

Isso conectará ao MQTT e iniciará a API REST na porta 8000

### 3. Consumir no Frontend React
```javascript
// Exemplo com fetch
const fetchBandData = async () => {
  const response = await fetch('http://localhost:8000/api/band/current');
  const data = await response.json();
  console.log(data);
};

// Exemplo com axios
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000'
});

const getBandData = async () => {
  const { data } = await api.get('/api/band/current');
  return data;
};

const getAlerts = async () => {
  const { data } = await api.get('/api/band/alerts');
  return data;
};
```

## Resposta de Exemplo

### GET /api/band/current
```json
{
  "current_state": {
    "device": "eloyband_01",
    "mode": "Working",
    "heart_rate": 75,
    "distance_cm": 35,
    "timestamp": "2024-01-15T10:30:45.123456"
  },
  "time_accumulation": {
    "WorkOFF": 120,
    "WorkON": 450,
    "Working": 300
  },
  "alerts": [
    {
      "type": "low_productivity",
      "message": "⚠️  Low productivity detected! WorkON time (450s) is 1.5x higher than WORKING time (300s).",
      "timestamp": "2024-01-15T10:30:45.123456",
      "severity": "medium"
    }
  ],
  "is_connected": true
}
```

### GET /api/band/statistics
```json
{
  "time_accumulation": {
    "WorkOFF": 120,
    "WorkON": 450,
    "Working": 300
  },
  "total_time": 870,
  "percentages": {
    "WorkOFF": 13.79,
    "WorkON": 51.72,
    "Working": 34.48
  },
  "alert_history": [
    {
      "type": "low_productivity",
      "message": "⚠️  Low productivity detected!...",
      "timestamp": "2024-01-15T10:30:45.123456",
      "severity": "medium"
    }
  ]
}
```

## Deploy no Render

### Passo a Passo

1. **Crie um repositório Git** com os arquivos:
   - `mqtt_processor.py`
   - `api.py`
   - `requirements.txt`
   - `render.yaml` (opcional, para configuração automática)

2. **Faça push para o GitHub**
```bash
git add .
git commit -m "Add IoT Band Backend"
git push origin main
```

3. **No Render Dashboard**
   - Clique em "New +" → "Web Service"
   - Conecte seu repositório GitHub
   - Selecione a branch `main`
   - Configure:
     - **Build Command**: `pip install -r requirements.txt`
     - **Start Command**: `python api.py`
     - **Environment**: Python
   - Adicione variáveis de ambiente:
     - `MQTT_BROKER`: `44.223.43.74`
     - `MQTT_PORT`: `1883`
     - `MQTT_TOPIC_DATA`: `TEF/device023/attrs/d`
     - `MQTT_TOPIC_ALERTS`: `TEF/device023/attrs/a`
     - `PORT`: `8000`

4. **Deploy**
   - Clique em "Create Web Service"
   - Aguarde o deploy completar
   - Copie a URL pública (ex: `https://seu-app.onrender.com`)

### Usar a URL no Frontend
```javascript
const API_URL = 'https://seu-app.onrender.com'; // URL do Render

const getBandData = async () => {
  const response = await fetch(`${API_URL}/api/band/current`);
  return response.json();
};
```

## Configuração de Alertas

Edite os limites em `mqtt_processor.py`:

```python
# Em BandDataProcessor.__init__()
self.OVERWORKING_THRESHOLD = 3600  # 1 hora em segundos
self.LOW_PRODUCTIVITY_RATIO = 2.0  # Razão WorkON/Working
```

## Troubleshooting

### Conexão MQTT falhando
- Verifique se o broker `44.223.43.74:1883` está acessível
- Confirme que o simulador está publicando dados
- Verifique os tópicos MQTT

### API não inicia
```bash
# Verifique as dependências
pip install -r requirements.txt

# Verifique a porta
python api.py  # Padrão: 8000
```

### CORS errors no frontend
A API já tem CORS habilitado para `*`. Se precisar restringir:

Edite `api.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://seu-frontend.com"],  # Seu domínio
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Estrutura de Dados

### Estado da Banda
```python
{
    "device": str,           # ID do dispositivo
    "mode": str,             # WorkOFF, WorkON ou Working
    "heart_rate": int,       # Batimentos por minuto
    "distance_cm": int,      # Distância em centímetros
    "timestamp": str,        # ISO format timestamp
}
```

### Acumulação de Tempo
```python
{
    "WorkOFF": float,        # Segundos em WorkOFF
    "WorkON": float,         # Segundos em WorkON
    "Working": float,        # Segundos em Working
}
```

### Alerta
```python
{
    "type": str,             # "overworking" ou "low_productivity"
    "message": str,          # Mensagem descritiva
    "timestamp": str,        # ISO format timestamp
    "severity": str,         # "high" ou "medium"
}
```

## Próximos Passos

1. Integre o frontend React com os endpoints da API
2. Implemente visualizações de dados (gráficos, tabelas)
3. Configure alertas em tempo real (WebSocket ou polling)
4. Adicione persistência de dados (banco de dados)
5. Implemente autenticação se necessário

## Suporte

Para dúvidas ou problemas, verifique:
- Logs da API em `http://localhost:8000/health`
- Documentação interativa em `http://localhost:8000/docs`
- Arquivo de configuração em `.env`
