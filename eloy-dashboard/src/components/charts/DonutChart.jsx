import React from "react";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

export default function DonutChart({ data }) {
  const chartData = {
    labels: ["WorkOFF", "WorkON", "Working"],
    datasets: [
      {
        data: [data.WorkOFF, data.WorkON, data.Working],
        backgroundColor: ["#ff7b7b", "#4aa8ff", "#44ff99"],
      },
    ],
  };

  const options = {
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom" },
    },
  };

  return (
    <div style={{ height: 300 }}>
      <Doughnut data={chartData} options={options} />
    </div>
  );
}
