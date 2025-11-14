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

export default function Home() {
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
  const [currentAlert, setCurrentAlert] = useState<any>(null);
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
      setDistance(data.current_state.distance_cm.toString());
      setMode(data.current_state.mode);

      // Converter tempo acumulado em contagem (aproximado)
      const timeAccum = data.time_accumulation;
      const total = timeAccum.WorkOFF + timeAccum.WorkON + timeAccum.Working;
      
      if (total > 0) {
        setModeCounts({
          WorkOFF: Math.round(timeAccum.WorkOFF),
          WorkON: Math.round(timeAccum.WorkON),
          Working: Math.round(timeAccum.Working),
        });
      }

      // Atualizar alerta (mostrar na tela, substituindo o anterior)
      if (data.alerts.length > 0) {
        setCurrentAlert(data.alerts[0]);
      } else {
        setCurrentAlert(null);
      }

      // Atualizar status de conexão (apenas quando há mudança)
      if (!previousConnectionStateRef.current && data.is_connected) {
        setIsConnected(true);
        previousConnectionStateRef.current = true;
        addLog("✓ Conectado ao backend");
        toast.success("Conectado ao backend");
      } else if (previousConnectionStateRef.current && !data.is_connected) {
        setIsConnected(false);
        previousConnectionStateRef.current = false;
        addLog("✗ Backend desconectado do MQTT");
        toast.warning("Backend desconectado do MQTT");
      }

      updateChart(modeCounts);
    } catch (error) {
      if (isConnected) {
        setIsConnected(false);
        addLog(`✗ Erro ao conectar: ${error}`);
        toast.error(`Erro: ${error}`);
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

      // Iniciar polling
      fetchBandData();
      pollingIntervalRef.current = setInterval(fetchBandData, 2000);
    } catch (error) {
      addLog(`✗ Erro ao conectar: ${error}`);
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
      setAlerts([]);
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

  useEffect(() => {
    // Fechar alerta após 10 segundos se não houver novo
    if (currentAlert) {
      const timer = setTimeout(() => {
        setCurrentAlert(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [currentAlert]);

  useEffect(() => {
    updateChart(modeCounts);
  }, [modeCounts]);

  return (
    <div className="min-h-screen bg-background text-foreground dark flex flex-col overflow-hidden">
      <Toaster position="top-right" />

      {/* Header */}
      <header className="border-b border-border bg-card shadow-lg flex-shrink-0 px-3 sm:px-6 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <div className="rounded-lg bg-accent p-1 sm:p-1.5 flex-shrink-0">
              <Radio className="h-4 w-4 sm:h-5 sm:w-5 text-accent-foreground" />
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
              </div>
            ) : (
              <div className="flex items-center gap-1 sm:gap-2 rounded-lg bg-red-500/20 px-2 sm:px-3 py-1 sm:py-1.5">
                <WifiOff className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-red-500 flex-shrink-0" />
                <span className="text-xs font-semibold text-red-400 hidden sm:inline">Offline</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <div className="grid h-full grid-cols-1 sm:grid-cols-12 gap-1.5 sm:gap-2 p-2 sm:p-3">
          {/* Left Column - Configuration (full on mobile, 2 cols on desktop) */}
          <div className="col-span-1 sm:col-span-2 flex flex-col gap-1.5 sm:gap-2 min-h-0">
            <Card className="flex flex-col gap-1.5 sm:gap-2 p-2 sm:p-3 flex-shrink-0">
              <h2 className="text-xs sm:text-sm font-bold">Config</h2>

              <div className="space-y-0.5 sm:space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">API URL</label>
                <Input
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  disabled={isConnected}
                  className="text-xs h-7 sm:h-8"
                  placeholder="https://iot-band-api.onrender.com"
                />
              </div>

              <div className="flex gap-2 pt-0.5 sm:pt-1">
                {!isConnected ? (
                  <Button
                    onClick={connectBackend}
                    disabled={isConnecting}
                    className="flex-1 h-7 sm:h-8 text-xs bg-accent hover:bg-accent/90"
                  >
                    {isConnecting ? "..." : "Conectar"}
                  </Button>
                ) : (
                  <Button
                    onClick={disconnectBackend}
                    variant="destructive"
                    className="flex-1 h-7 sm:h-8 text-xs"
                  >
                    Desconectar
                  </Button>
                )}
              </div>

              <Button
                onClick={resetData}
                disabled={!isConnected}
                variant="outline"
                className="w-full h-7 sm:h-8 text-xs"
              >
                Reset
              </Button>
            </Card>

            {/* Logs */}
            <Card className="flex flex-col gap-1.5 sm:gap-2 p-2 sm:p-3 flex-1 min-h-0 overflow-hidden">
              <div className="flex items-center justify-between flex-shrink-0">
                <h2 className="text-xs sm:text-sm font-bold">Log</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowLogs(!showLogs)}
                  className="h-5 sm:h-6 px-1.5 sm:px-2 text-xs"
                >
                  <ChevronDown className={`h-3 w-3 transition-transform ${showLogs ? "rotate-180" : ""}`} />
                </Button>
              </div>

              {showLogs && (
                <div className="flex-1 overflow-y-auto rounded-lg bg-muted p-1.5 sm:p-2 font-mono text-xs min-h-0 space-y-0.5">
                  {logs.length === 0 ? (
                    <p className="text-muted-foreground text-xs">Aguardando...</p>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} className="text-muted-foreground text-xs line-clamp-1">
                        {log}
                      </div>
                    ))
                  )}
                </div>
              )}
            </Card>
          </div>

          {/* Center Column - Chart (full on mobile, 5 cols on desktop) */}
          <div className="col-span-1 sm:col-span-5 flex flex-col gap-1.5 sm:gap-2 min-h-0">
            <Card className="flex flex-col items-center justify-center p-2 sm:p-3 flex-1 min-h-0">
              <h2 className="text-xs sm:text-sm font-bold flex-shrink-0">Distribuição</h2>
              <div className="flex-1 flex items-center justify-center min-h-0 w-full">
                <canvas
                  ref={canvasRef}
                  width={160}
                  height={160}
                  className="sm:w-auto sm:h-auto max-w-full max-h-full"
                  style={{ width: "160px", height: "160px" }}
                />
              </div>
              <div className="mt-1.5 sm:mt-2 flex gap-2 sm:gap-3 text-xs flex-shrink-0 flex-wrap justify-center">
                <div className="flex items-center gap-1">
                  <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full flex-shrink-0" style={{ backgroundColor: "#ef4444" }} />
                  <span className="text-xs">OFF: {modeCounts.WorkOFF}s</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full flex-shrink-0" style={{ backgroundColor: "#22c55e" }} />
                  <span className="text-xs">ON: {modeCounts.WorkON}s</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full flex-shrink-0" style={{ backgroundColor: "#a855f7" }} />
                  <span className="text-xs">WRK: {modeCounts.Working}s</span>
                </div>
              </div>
            </Card>

            {/* Indicators */}
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 flex-shrink-0">
              <Card className="flex flex-col items-center justify-center gap-0.5 sm:gap-1 p-1.5 sm:p-2">
                <Activity className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent flex-shrink-0" />
                <p className="text-xs text-muted-foreground">HR</p>
                <p className="text-lg sm:text-xl font-bold">{heartRate}</p>
                <p className="text-xs text-muted-foreground">bpm</p>
              </Card>

              <Card className="flex flex-col items-center justify-center gap-0.5 sm:gap-1 p-1.5 sm:p-2">
                <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent flex-shrink-0" />
                <p className="text-xs text-muted-foreground">Dist</p>
                <p className="text-lg sm:text-xl font-bold">{distance}</p>
                <p className="text-xs text-muted-foreground">cm</p>
              </Card>

              <Card className="flex flex-col items-center justify-center gap-0.5 sm:gap-1 p-1.5 sm:p-2">
                <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent flex-shrink-0" />
                <p className="text-xs text-muted-foreground">Modo</p>
                <p className="text-sm sm:text-base font-bold text-center line-clamp-1">{mode}</p>
              </Card>
            </div>
          </div>

          {/* Right Column - Stats (full on mobile, 5 cols on desktop) */}
          <div className="col-span-1 sm:col-span-5 flex flex-col gap-1.5 sm:gap-2 min-h-0">
            <Card className="flex flex-col gap-1.5 sm:gap-2 p-2 sm:p-3 flex-1 min-h-0 overflow-y-auto">
              <h2 className="text-xs sm:text-sm font-bold flex-shrink-0">Estatísticas</h2>

              <div className="space-y-1 sm:space-y-2 flex-1 min-h-0">
                <div className="rounded-lg bg-muted p-1.5 sm:p-2 flex-shrink-0">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-xl sm:text-2xl font-bold">
                    {modeCounts.WorkOFF + modeCounts.WorkON + modeCounts.Working}s
                  </p>
                </div>

                <div className="rounded-lg bg-muted p-1.5 sm:p-2 flex-shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">WorkOFF</p>
                      <p className="text-lg sm:text-xl font-bold text-accent">{modeCounts.WorkOFF}s</p>
                    </div>
                    <div className="w-12 sm:w-16 h-5 sm:h-6 rounded-full bg-background flex-shrink-0">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{
                          width:
                            modeCounts.WorkOFF + modeCounts.WorkON + modeCounts.Working === 0
                              ? "0%"
                              : `${(modeCounts.WorkOFF / (modeCounts.WorkOFF + modeCounts.WorkON + modeCounts.Working)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-muted p-1.5 sm:p-2 flex-shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">WorkON</p>
                      <p className="text-lg sm:text-xl font-bold text-accent">{modeCounts.WorkON}s</p>
                    </div>
                    <div className="w-12 sm:w-16 h-5 sm:h-6 rounded-full bg-background flex-shrink-0">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
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
                      <p className="text-lg sm:text-xl font-bold text-accent">{modeCounts.Working}s</p>
                    </div>
                    <div className="w-12 sm:w-16 h-5 sm:h-6 rounded-full bg-background flex-shrink-0">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
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

                {currentAlert && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-1.5 sm:p-2 flex-shrink-0">
                    <p className="text-xs font-bold text-red-500 mb-1">🚨 {currentAlert.type}</p>
                    <p className="text-xs text-red-400">
                      {currentAlert.message}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
