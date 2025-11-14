import React from "react";
import "./TechCard.css";

export default function TechCard({ title, value, icon, color }) {
  return (
    <div className="tech-card" style={{ borderColor: color }}>
      <div className="tech-card-icon" style={{ color }}>
        {icon}
      </div>

      <div className="tech-card-content">
        <h3>{title}</h3>
        <p>{value}</p>
      </div>
    </div>
  );
}
