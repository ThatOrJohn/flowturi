import React from "react";
import "./ModeToggle.css";

export type Mode = "historical" | "realtime";

interface ModeToggleProps {
  currentMode: Mode;
  onModeChange: (mode: Mode) => void;
}

const ModeToggle: React.FC<ModeToggleProps> = ({
  currentMode,
  onModeChange,
}) => {
  return (
    <div className="mode-toggle-container">
      <div className="mode-toggle">
        <button
          className={`mode-toggle-button ${
            currentMode === "historical" ? "active" : ""
          }`}
          onClick={() => onModeChange("historical")}
        >
          Historical
        </button>
        <button
          className={`mode-toggle-button ${
            currentMode === "realtime" ? "active" : ""
          }`}
          onClick={() => onModeChange("realtime")}
        >
          Real-Time
        </button>
        <div
          className="mode-toggle-indicator"
          style={{
            transform: `translateX(${
              currentMode === "historical" ? "0" : "100%"
            })`,
          }}
        />
      </div>
    </div>
  );
};

export default ModeToggle;
