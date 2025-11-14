import React, { useEffect, useState, useRef } from "react";
import { connectMQTT, subscribeTopic, disconnectMQTT } from "./mqttClient";
import Dashboard from "./pages/Dashboard";

export default function App() {
  const [connected, setConnected] = useState(false);
  const [mqttData, setMqttData] = useState(null);
  const clientRef = useRef(null);

  useEffect(() => {
    console.log("Conectando ao MQTT...");

    const client = connectMQTT({
      url: "wss://broker.emqx.io:8084/mqtt",
      onConnect: () => {
        console.log("MQTT conectado");
        setConnected(true);
      },
      onDisconnect: () => setConnected(false),
      onMessage: (topic, payload) => {
        try {
          const json = JSON.parse(payload.toString());
          setMqttData(json);
        } catch (err) {
          console.error("Erro ao parsear JSON", err);
        }
      },
    });

    clientRef.current = client;

    subscribeTopic(client, "eloy/band/data");

    return () => disconnectMQTT(client);
  }, []);

  return <Dashboard mqttData={mqttData} connected={connected} />;
}
