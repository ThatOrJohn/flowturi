import { useEffect, useState, useRef } from "react";
import { useDropzone } from "react-dropzone";
import SankeyDiagram from "./components/SankeyDiagram";
import ErrorBoundary from "./components/ErrorBoundary";
import Papa from "papaparse";
import "./App.css";

const THEME_KEY = "flowturi-theme";

const getPreferredTheme = () => {
  // Check localStorage first
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark") return stored;
  // Check OS-level preference
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  ) {
    return "light";
  }
  // Default to dark
  return "dark";
};

const App = () => {
  const [snapshots, setSnapshots] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1); // Speed multiplier (0.25x to 2x)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [error, setError] = useState(null);
  const [theme, setTheme] = useState(getPreferredTheme());
  const [fileInfo, setFileInfo] = useState(null); // Track file information
  const speedMenuRef = useRef(null);

  // Apply theme to <body> for full-page theming
  useEffect(() => {
    document.body.className = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // Listen for OS-level theme changes if user hasn't overridden
  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark") return; // user override
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = (e) => setTheme(e.matches ? "light" : "dark");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Handle file upload
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) {
      setError("No file selected.");
      setFileInfo(null);
      return;
    }

    // Store file information
    setFileInfo({
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: new Date(file.lastModified).toLocaleString(),
    });

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".json") && !fileName.endsWith(".csv")) {
      setError("Please upload a JSON or CSV file.");
      setSnapshots([]);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let parsedData;

        if (fileName.endsWith(".json")) {
          parsedData = JSON.parse(e.target.result);
          if (!Array.isArray(parsedData) || parsedData.length === 0) {
            throw new Error("JSON must be an array of snapshots.");
          }
          for (const frame of parsedData) {
            if (!frame.timestamp || !frame.nodes || !frame.links) {
              throw new Error(
                "Each frame must have 'timestamp', 'nodes', and 'links' properties."
              );
            }
            if (!Array.isArray(frame.nodes) || !Array.isArray(frame.links)) {
              throw new Error("'nodes' and 'links' must be arrays.");
            }
          }
        } else if (fileName.endsWith(".csv")) {
          const csvData = Papa.parse(e.target.result, {
            header: true,
            skipEmptyLines: true,
            dynamicTyping: true,
          });

          if (csvData.errors.length > 0) {
            throw new Error("Error parsing CSV: " + csvData.errors[0].message);
          }

          const rows = csvData.data;
          if (rows.length === 0) {
            throw new Error("CSV file is empty.");
          }

          const requiredColumns = ["timestamp", "source", "target", "value"];
          const columns = Object.keys(rows[0]);
          for (const col of requiredColumns) {
            if (!columns.includes(col)) {
              throw new Error(`CSV must contain '${col}' column.`);
            }
          }

          const framesMap = new Map();
          rows.forEach((row) => {
            const timestamp = row.timestamp;
            if (!framesMap.has(timestamp)) {
              framesMap.set(timestamp, []);
            }
            framesMap.get(timestamp).push(row);
          });

          parsedData = Array.from(framesMap.entries()).map(
            ([timestamp, frameRows]) => {
              const nodeNames = new Set();
              frameRows.forEach((row) => {
                nodeNames.add(row.source);
                nodeNames.add(row.target);
              });
              const nodes = Array.from(nodeNames).map((name) => ({
                name,
              }));

              const links = frameRows.map((row) => ({
                source: row.source,
                target: row.target,
                value: row.value,
              }));

              return {
                timestamp,
                nodes,
                links,
              };
            }
          );

          parsedData.sort(
            (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
          );

          if (parsedData.length === 0) {
            throw new Error("No valid frames extracted from CSV.");
          }
          for (const frame of parsedData) {
            if (!frame.nodes.length || !frame.links.length) {
              throw new Error(
                "Each frame must have at least one node and one link."
              );
            }
            for (const link of frame.links) {
              if (
                !frame.nodes.some((node) => node.name === link.source) ||
                !frame.nodes.some((node) => node.name === link.target)
              ) {
                throw new Error(
                  `Invalid link: source '${link.source}' or target '${link.target}' not found in nodes.`
                );
              }
            }
          }
        }

        // Update file info with data-specific details
        setFileInfo((prev) => ({
          ...prev,
          snapshots: parsedData.length,
          nodes: parsedData[0]?.nodes.length || 0,
          links: parsedData[0]?.links.length || 0,
        }));

        setSnapshots(parsedData);
        setCurrentIndex(0);
        setIsPlaying(false);
        setError(null);
      } catch (err) {
        setError("Invalid file format: " + err.message);
        setSnapshots([]);
      }
    };
    reader.onerror = () => {
      setError("Error reading the file.");
      setSnapshots([]);
    };
    reader.readAsText(file);
  };

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

  // Dropzone file upload handler
  const onDrop = (acceptedFiles) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      // Simulate a synthetic event for handleFileUpload
      const file = acceptedFiles[0];
      handleFileUpload({ target: { files: [file] } });
    }
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/json": [".json"],
      "text/csv": [".csv"],
    },
    multiple: false,
  });

  // Theme toggle handler
  const toggleTheme = () =>
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  // Theme toggle switch (A11y, Dribbble-inspired, text only, with side labels)
  const themeToggleSwitch = (
    <div className="theme-toggle-bar">
      <span className="theme-label-left">DARK</span>
      <label className="theme-switch" title="Toggle light/dark mode">
        <input
          type="checkbox"
          checked={theme === "dark"}
          onChange={toggleTheme}
          aria-label="Toggle dark mode"
        />
        <span className="slider" />
      </label>
      <span className="theme-label-right">LIGHT</span>
    </div>
  );

  // Format file size nicely
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + " bytes";
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    else return (bytes / 1048576).toFixed(1) + " MB";
  };

  // File info panel JSX
  const fileInfoPanel = (
    <div className={`file-info-panel ${theme}`}>
      <h3>File Information</h3>
      {fileInfo ? (
        <div className="file-stats">
          <p>
            <strong>Name:</strong> {fileInfo.name}
          </p>
          <p>
            <strong>Size:</strong> {formatFileSize(fileInfo.size)}
          </p>
          <p>
            <strong>Type:</strong> {fileInfo.type}
          </p>
          <p>
            <strong>Modified:</strong> {fileInfo.lastModified}
          </p>
          {fileInfo.snapshots && (
            <>
              <p>
                <strong>Snapshots:</strong> {fileInfo.snapshots}
              </p>
              <p>
                <strong>Nodes:</strong> {fileInfo.nodes}
              </p>
              <p>
                <strong>Links:</strong> {fileInfo.links}
              </p>
              {currentSnapshot && (
                <p>
                  <strong>Current Frame:</strong> {currentIndex + 1} of{" "}
                  {snapshots.length}
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <p>No file loaded</p>
      )}
    </div>
  );

  // File upload input JSX (Dropzone)
  const fileUploadInput = (
    <div className={`file-upload-dropzone ${theme}`} {...getRootProps()}>
      <input {...getInputProps()} />
      {isDragActive ? (
        <p>Drop the JSON or CSV file here...</p>
      ) : (
        <>
          <p>
            <b>Upload JSON or CSV File:</b>
          </p>
          <button type="button" className={`dropzone-select-btn ${theme}`}>
            Select File
          </button>
          <p
            style={{
              fontSize: "0.9em",
              color: theme === "dark" ? "#aaa" : "#555",
            }}
          >
            or drag and drop a file here
          </p>
        </>
      )}
    </div>
  );

  return (
    <div className={`App ${theme}`}>
      <div className="app-header">
        <h1>Flowturi Studio</h1>
        {themeToggleSwitch}
      </div>
      {error ? (
        <>
          <div className="file-control-row">
            {fileUploadInput}
            {fileInfoPanel}
          </div>
          <p className="error-message">{error}</p>
        </>
      ) : snapshots.length === 0 ? (
        <>
          <div className="file-control-row">
            {fileUploadInput}
            {fileInfoPanel}
          </div>
          <p className="no-data-message">
            Please upload a JSON or CSV file to visualize.
          </p>
        </>
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
          <div className="file-control-row">
            {fileUploadInput}
            {fileInfoPanel}
          </div>
        </>
      )}
    </div>
  );
};

export default App;
