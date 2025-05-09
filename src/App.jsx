import { useEffect, useState, useRef } from "react";
import SankeyDiagram from "./components/SankeyDiagram";
import ErrorBoundary from "./components/ErrorBoundary";
import { jsonConnector } from "./data/connectors";
import "./App.css";

const App = () => {
  const [snapshots, setSnapshots] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1000); // Base interval (1s) adjusted by speed multiplier
  const [speedMultiplier, setSpeedMultiplier] = useState(1); // Speed multiplier (0.25x to 2x)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [error, setError] = useState(null);
  const speedMenuRef = useRef(null);

  // Load data
  useEffect(() => {
    jsonConnector("/data.json")
      .then((fetchedData) => {
        console.log("Fetched snapshots:", fetchedData);
        if (!Array.isArray(fetchedData) || fetchedData.length === 0) {
          throw new Error(
            "Invalid data format: expected an array of snapshots"
          );
        }
        setSnapshots(fetchedData);
      })
      .catch((err) => {
        console.error("Error loading data:", err);
        setError("Failed to load data. Check the console for details.");
      });
  }, []);

  // Playback timer
  useEffect(() => {
    if (!isPlaying || snapshots.length === 0) return;

    const baseInterval = 1000; // 1 second base interval
    const interval = baseInterval / speedMultiplier; // Adjust interval by speed multiplier

    const timer = setInterval(() => {
      setCurrentIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % snapshots.length;
        if (nextIndex === 0) setIsPlaying(false); // Stop at the end
        return nextIndex;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [isPlaying, snapshots, speedMultiplier]);

  // Close speed menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        speedMenuRef.current &&
        !speedMenuRef.current.contains(event.target)
      ) {
        setShowSpeedMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Playback controls
  const handlePlayPause = () => {
    setIsPlaying((prev) => !prev);
  };

  const handleSliderChange = (e) => {
    setCurrentIndex(Number(e.target.value));
    setIsPlaying(false);
  };

  const handleSpeedChange = (multiplier) => {
    setSpeedMultiplier(multiplier);
    setShowSpeedMenu(false);
  };

  const handleSpeedSliderChange = (e) => {
    setSpeedMultiplier(Number(e.target.value));
  };

  const currentSnapshot = snapshots[currentIndex] || null;

  return (
    <div className="App">
      <h1>Flowturi Studio</h1>
      {error ? (
        <p style={{ color: "red", textAlign: "center" }}>{error}</p>
      ) : snapshots.length === 0 ? (
        <p style={{ textAlign: "center" }}>Loading...</p>
      ) : (
        <>
          <div className="playback-controls">
            <div className="controls-bar">
              <button
                onClick={handlePlayPause}
                className="control-button"
                disabled={snapshots.length <= 1}
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <svg className="icon" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6zm8 0h4v16h-4z" />
                  </svg>
                ) : (
                  <svg className="icon" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <div className="slider-wrapper">
                <input
                  type="range"
                  min="0"
                  max={snapshots.length - 1}
                  value={currentIndex}
                  onChange={handleSliderChange}
                  disabled={snapshots.length <= 1}
                  className="timeline-slider"
                />
                <span className="timestamp">
                  {currentSnapshot?.timestamp || "N/A"}
                </span>
              </div>
              <div className="speed-menu-container" ref={speedMenuRef}>
                <button
                  onClick={() => setShowSpeedMenu((prev) => !prev)}
                  className="control-button"
                  disabled={snapshots.length <= 1}
                  title="Playback Speed"
                >
                  <svg className="icon" viewBox="0 0 24 24">
                    <path d="M19.5 13.5 16 16l-3.5-3.5L9 16l-3.5-3.5L2 16V2l3.5 3.5L9 2l3.5 3.5L16 2l3.5 3.5L22 2v14l-2.5-2.5zM12 12.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm0-4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" />
                  </svg>
                  <span className="speed-label">{speedMultiplier}x</span>
                </button>
                {showSpeedMenu && (
                  <div className="speed-menu">
                    <div className="speed-options">
                      {[0.25, 0.5, 1, 1.5, 2].map((speed) => (
                        <button
                          key={speed}
                          onClick={() => handleSpeedChange(speed)}
                          className={speedMultiplier === speed ? "active" : ""}
                        >
                          {speed}x
                        </button>
                      ))}
                    </div>
                    <div className="speed-slider">
                      <input
                        type="range"
                        min="0.25"
                        max="2"
                        step="0.25"
                        value={speedMultiplier}
                        onChange={handleSpeedSliderChange}
                      />
                      <span>Speed: {speedMultiplier}x</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <ErrorBoundary>
            <SankeyDiagram data={currentSnapshot} />
          </ErrorBoundary>
        </>
      )}
    </div>
  );
};

export default App;
