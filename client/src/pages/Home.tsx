// Conteúdo completo do arquivo client/src/pages/Home.tsx

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { AlertCircle, Wifi, WifiOff, Activity, Zap, Radio, ChevronDown } from "lucide-react";
import { Toaster, toast } from "sonner";

interface BandState {
  current_state: {
    device: string;
    mode: "WorkOFF" | "WorkON" | "Working";
    heart_rate: number;
    distance_cm: number;
    timestamp: string;
  };
  time_accumulation: {
    WorkOFF: number;
    WorkON: number;
    Working: number;
  };
  alerts: Array<{
    type: string;
    message: string;
    timestamp: string;
    severity: string;
  }>;
  is_connected: boolean;
}

interface ModeCount {
  WorkOFF: number;
  WorkON: number;
  Working: number;
}

const API_URL = "https://iot-band-api.onrender.com";

export default function Home(  ) {
  const [apiUrl, setApiUrl] = useState(API_URL);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [heartRate, setHeartRate] = useState("--");
  const [distance, setDistance] = useState("--");
  const [mode, setMode] = useState("--");
  const [modeCounts, setModeCounts] = useState<ModeCount>({
    WorkOFF: 0,
    WorkON: 0,
    Working: 0,
  });
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [currentAlert, setCurrentAlert] = useState<any>(null); // Mantido para compatibilidade, mas não será usado para o alerta flutuante
  const [alerts, setAlerts] = useState<any[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const previousConnectionStateRef = useRef<boolean>(false);

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev.slice(-9), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const updateChart = (counts: ModeCount) => {
    if (!canvasRef.current) return;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const width = canvasRef.current.width;
    const height = canvasRef.current.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 15;

    ctx.clearRect(0, 0, width, height);

    const total = counts.WorkOFF + counts.WorkON + counts.Working;
    if (total === 0) {
      ctx.fillStyle = "rgba(149, 149, 149, 0.3)";
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    const colors = [
      "#ef4444",
      "#22c55e",
      "#a855f7",
    ];
    const getContrastColor = (hex: string) => {
      const c = hex.replace("#", "");
      const r = parseInt(c.substring(0, 2), 16);
      const g = parseInt(c.substring(2, 4), 16);
      const b = parseInt(c.substring(4, 6), 16);
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      return luminance > 0.6 ? "#000000" : "#ffffff";
    };
    const modes = ["WorkOFF", "WorkON", "Working"] as const;
    let currentAngle = -Math.PI / 2;

    modes.forEach((modeKey, index) => {
      const value = counts[modeKey];
      const sliceAngle = (value / total) * Math.PI * 2;

      ctx.fillStyle = colors[index];
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.closePath();
      ctx.fill();

      if (value > 0) {
        // Angulo central da fatia
        const textAngle = currentAngle + sliceAngle / 2;

        // Ponto na borda do arco (para iniciar a linha-guia)
        const edgeX = centerX + Math.cos(textAngle) * radius;
        const edgeY = centerY + Math.sin(textAngle) * radius;

        // Posição do rótulo fora do donut
        const labelRadius = radius * 0.92;
        const labelX = centerX + Math.cos(textAngle) * labelRadius;
        const labelY = centerY + Math.sin(textAngle) * labelRadius;

        // Formatação da porcentagem
        const percentage = (value / total) * 100;
        const labelText = percentage < 1 ? `${percentage.toFixed(1)}%` : `${Math.round(percentage)}%`;

        // Desenhar linha-guia curta conectando arco -> rótulo
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        // linha do interior do donut até a borda
        const innerLineStartX = centerX + Math.cos(textAngle) * (radius * 0.65);
        const innerLineStartY = centerY + Math.sin(textAngle) * (radius * 0.65);
        ctx.moveTo(innerLineStartX, innerLineStartY);
        ctx.lineTo(edgeX, edgeY);
        ctx.lineTo(labelX, labelY);
        ctx.stroke();

        // Desenhar texto do rótulo com contraste automático
        ctx.fillStyle = getContrastColor(colors[index]);
        ctx.font = "600 12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(labelText, labelX, labelY);
      }

      currentAngle += sliceAngle;
    });

    ctx.fillStyle = "oklch(0.12 0 0)";
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.55, 0, Math.PI * 2);
    ctx.fill();
  };

  const fetchBandData = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/band/current`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: BandState = await response.json();

      // Atualizar estado
      setHeartRate(data.current_state.heart_rate.toString());
      setDistance(Math.round(data.current_state.distance_cm).toString()); // CORREÇÃO: Arredonda a distância
      setMode(data.current_state.mode);

      // O backend já retorna o tempo acumulado em segundos.
      const timeAccum = data.time_accumulation;
      const total = timeAccum.WorkOFF + timeAccum.WorkON + timeAccum.Working;
      
      // Atualizar o estado de contagem (tempo acumulado)
      if (total > 0) {
        const newModeCounts = {
          WorkOFF: Math.round(timeAccum.WorkOFF),
          WorkON: Math.round(timeAccum.WorkON),
          Working: Math.round(timeAccum.Working),
        };
        setModeCounts(newModeCounts);
        updateChart(newModeCounts);
      } else {
        updateChart({ WorkOFF: 0, WorkON: 0, Working: 0 });
      }

      // O frontend agora só exibe os alertas na seção "Alertas e Detalhes"
      // A lógica de alerta flutuante e seu timeout foram removidos.
      // Atualizar o estado de alertas para renderização na seção "Alertas e Detalhes"
      setAlerts(data.alerts);

      // Atualizar status de conexão (apenas quando há mudança)
      if (!previousConnectionStateRef.current && data.is_connected) {
        setIsConnected(true);
        previousConnectionStateRef.current = true;
        addLog("✓ Conectado ao backend");
      } else if (previousConnectionStateRef.current && !data.is_connected) {
        setIsConnected(false);
        previousConnectionStateRef.current = false;
        addLog("✗ Backend desconectado do MQTT");
      }

    } catch (error) {
      if (isConnected) {
        setIsConnected(false);
        addLog(`✗ Erro ao conectar: ${error}`);
      }
    }
  };

  const connectBackend = async () => {
    setIsConnecting(true);
    try {
      // Testar conexão
      const response = await fetch(`${apiUrl}/health`);
      if (!response.ok) {
        throw new Error("Backend não respondeu");
      }

      addLog("✓ Conectando ao backend...");
      setIsConnected(true);
      previousConnectionStateRef.current = true;
      setIsConnecting(false);
      toast.success("Conectado ao backend!");

      // Iniciar polling
      fetchBandData();
      pollingIntervalRef.current = setInterval(fetchBandData, 1000); // CORREÇÃO: Reduz o intervalo para 1s
    } catch (error) {
      addLog(`✗ Erro ao conectar: ${error}`);
      toast.error(`Erro ao conectar: ${error}`);
      setIsConnecting(false);
    }
  };

  const disconnectBackend = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsConnected(false);
    previousConnectionStateRef.current = false;
    addLog("✗ Desconectado");
    toast.info("Desconectado do backend");
  };

  const resetData = async () => {
    try {
      const response = await fetch(`${apiUrl}/api/band/reset`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Erro ao resetar");
      }
      setModeCounts({ WorkOFF: 0, WorkON: 0, Working: 0 });
      setAlerts([]); // Limpa os alertas no frontend
      addLog("🔄 Dados resetados");
      toast.success("Dados resetados com sucesso!");
    } catch (error) {
      addLog(`✗ Erro ao resetar: ${error}`);
      toast.error(`Erro ao resetar: ${error}`);
    }
  };

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Lógica de alerta flutuante removida a pedido do usuário.
  // Os alertas agora são exibidos apenas na seção "Alertas e Detalhes" (alerts state)


  return (
    <div className="min-h-screen bg-black text-foreground dark flex flex-col overflow-hidden">
      <Toaster position="top-right" />

      {/* Alerta flutuante removido a pedido do usuário. Os alertas agora são exibidos apenas na seção "Alertas e Detalhes" */}
      {/* O estado 'alerts' é usado para renderizar na seção 'Alertas e Detalhes' */}

      {/* Header */}
      <header className="border-b border-border bg-[#0b0b0b] shadow-lg flex-shrink-0 px-3 sm:px-6 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <div className="rounded-lg bg-accent p-1 sm:p-1.5 flex-shrink-0">
              <img src="/logo.svg" alt="Eloy logo" className="h-4 w-4 sm:h-5 sm:w-5 object-contain" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold truncate">EloyBand</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">Monitor REST API</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {isConnected ? (
              <div className="flex items-center gap-1 sm:gap-2 rounded-lg bg-green-500/20 px-2 sm:px-3 py-1 sm:py-1.5">
                <Wifi className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-500 animate-pulse flex-shrink-0" />
                <span className="text-xs font-semibold text-green-400 hidden sm:inline">Online</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={disconnectBackend}
                >
                  <WifiOff className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Input
                  type="url"
                  placeholder="URL do Backend (Render)"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  className="h-8 w-40 sm:w-64 text-xs"
                />
                <Button
                  onClick={connectBackend}
                  disabled={isConnecting}
                  className="h-8 text-xs px-3"
                >
                  {isConnecting ? "Conectando..." : "Conectar"}
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Coluna 1: Dados Atuais e Controles */}
          <div className="space-y-4">
            <Card className="p-4 sm:p-6 space-y-4" style={{borderRadius: '7px', backgroundColor: '#0b0b0b', border: '1.2px solid #202020'}}>
              <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-500" />
                Dados Atuais da Band
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-muted p-3 sm:p-4">
                  <p className="text-xs text-muted-foreground">Batimentos (BPM)</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-primary">{heartRate}</p>
                </div>
                <div className="rounded-lg bg-muted p-3 sm:p-4">
                  <p className="text-xs text-muted-foreground">Distância (cm)</p>
                  <p className="text-2xl sm:text-3xl font-extrabold text-primary">{distance}</p>
                </div>
              </div>
              <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 sm:p-4 text-center">
                <p className="text-sm text-primary-foreground/70">Modo Atual</p>
                <p className="text-3xl sm:text-4xl font-extrabold text-primary">
                  {mode}
                </p>
              </div>
              <Button onClick={resetData} variant="outline" className="w-full">
                Resetar Acumulação de Tempo
              </Button>
            </Card>

            {/* Logs */}
            <Card className="p-4 sm:p-6 space-y-4" style={{borderRadius: '7px', backgroundColor: '#0b0b0b', border: '1.2px solid #202020'}}>
              <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2 cursor-pointer" onClick={() => setShowLogs(!showLogs)}>
                <Zap className="h-5 w-5 text-yellow-500" />
                Logs de Eventos ({logs.length})
                <ChevronDown className={`h-4 w-4 transition-transform ${showLogs ? "rotate-180" : ""}`} />
              </h2>
              {showLogs && (
                <div className="h-40 overflow-y-auto bg-black p-2 rounded-lg text-xs font-mono text-green-400">
                  {logs.map((log, index) => (
                    <p key={index} className="whitespace-pre-wrap">{log}</p>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Coluna 2: Gráfico de Tempo Acumulado */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-4 sm:p-6 space-y-4" style={{borderRadius: '7px', backgroundColor: '#0b0b0b', border: '1.2px solid #202020'}}>
              <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                Tempo Acumulado por Modo
              </h2>
              <div className="flex flex-col md:flex-row gap-4 items-center">
                <div className="w-full md:w-1/2 flex justify-center">
                  <div className="relative w-64 h-64 sm:w-80 sm:h-80">
                    <canvas ref={canvasRef} width={320} height={320} className="absolute top-0 left-0"></canvas>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <p className="text-xs text-muted-foreground">Total Acumulado</p>
                      <p className="text-2xl font-bold">
                        {modeCounts.WorkOFF + modeCounts.WorkON + modeCounts.Working}s
                      </p>
                    </div>
                  </div>
                </div>
                <div className="w-full md:w-1/2 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-red-500 flex-shrink-0"></div>
                    <p className="text-sm font-medium">WorkOFF (Sem Batimentos)</p>
                    <p className="ml-auto text-sm font-bold">{modeCounts.WorkOFF}s</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-green-500 flex-shrink-0"></div>
                    <p className="text-sm font-medium">WorkON (Bat. + Longe)</p>
                    <p className="ml-auto text-sm font-bold">{modeCounts.WorkON}s</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-purple-500 flex-shrink-0"></div>
                    <p className="text-sm font-medium">Working (Bat. + Perto)</p>
                    <p className="ml-auto text-sm font-bold">{modeCounts.Working}s</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Alertas e Detalhes */}
            <Card className="p-4 sm:p-6 space-y-4" style={{borderRadius: '7px', backgroundColor: '#0b0b0b', border: '1.2px solid #202020'}}>
              <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                Alertas e Detalhes
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-lg bg-muted p-1.5 sm:p-2 flex-shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">WorkON</p>
                      <p className="text-lg sm:text-xl font-bold text-green-500">{modeCounts.WorkON}s</p>
                    </div>
                    <div className="w-12 sm:w-16 h-5 sm:h-6 rounded-full bg-background flex-shrink-0">
                      <div
                        className="h-full rounded-full bg-green-500 transition-all"
                        style={{
                          width:
                            modeCounts.WorkOFF + modeCounts.WorkON + modeCounts.Working === 0
                              ? "0%"
                              : `${(modeCounts.WorkON / (modeCounts.WorkOFF + modeCounts.WorkON + modeCounts.Working)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-muted p-1.5 sm:p-2 flex-shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Working</p>
                      <p className="text-lg sm:text-xl font-bold text-purple-500">{modeCounts.Working}s</p>
                    </div>
                    <div className="w-12 sm:w-16 h-5 sm:h-6 rounded-full bg-background flex-shrink-0">
                      <div
                        className="h-full rounded-full bg-purple-500 transition-all"
                        style={{
                          width:
                            modeCounts.WorkOFF + modeCounts.WorkON + modeCounts.Working === 0
                              ? "0%"
                              : `${(modeCounts.Working / (modeCounts.WorkOFF + modeCounts.WorkON + modeCounts.Working)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Renderiza os alertas ativos */}
                {alerts.map((alert, index) => (
                  <div key={index} className="rounded-lg bg-red-500/10 border border-red-500/30 p-1.5 sm:p-2 flex-shrink-0 sm:col-span-2">
                    <p className="text-xs font-bold text-red-500 mb-1">🚨 {alert.type.toUpperCase().replace('_', ' ')}</p>
                    <p className="text-xs text-red-300">
                      {alert.message}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
