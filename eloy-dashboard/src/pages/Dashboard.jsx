import React from "react";
import TechCard from "../components/TechCard";
import DonutChart from "../components/charts/DonutChart";
import { Cpu, Bell, Radar } from "lucide-react";
import "../styles/Dashboard.css";

export default function Dashboard({ mqttData, connected }) {
  return (
    <div className="dashboard">
      <div className="dash-header">
        <h2>EloyBand — Dashboard</h2>

        <span className={connected ? "status connected" : "status disconnected"}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>

      <div className="tech-card-grid">
        <TechCard
          title="Distância"
          value={
            mqttData?.distance !== undefined ? mqttData.distance + " cm" : "--"
          }
          icon={<Radar />}
          color="#4aa8ff"
        />

        <TechCard
          title="Status"
          value={mqttData?.alert ? "Perigo" : "Normal"}
          icon={<Bell />}
          color={mqttData?.alert ? "#ff3b3b" : "#44ff99"}
        />

        <TechCard
          title="Band ID"
          value="band-01"
          icon={<Cpu />}
          color="#b77bff"
        />
      </div>

      <h3 className="section-title">Modos da Band</h3>

      <div className="chart-box">
        <DonutChart
          data={{
            WorkOFF: mqttData?.WorkOFF || 0,
            WorkON: mqttData?.WorkON || 0,
            Working: mqttData?.Working || 0,
          }}
        />
      </div>
    </div>
  );
}
