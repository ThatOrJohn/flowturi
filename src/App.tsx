import { useEffect, useState, useRef } from "react";
import { useDropzone } from "react-dropzone";
import SankeyDiagram from "./components/SankeyDiagram";
import ErrorBoundary from "./components/ErrorBoundary";
import RecordButton from "./components/RecordButton";
import Papa from "papaparse";
import { Snapshot, FileInfo } from "./types";
import { FrameData } from "./layout/computeLayout";
import "./App.css";

const THEME_KEY = "flowturi-theme";

const getPreferredTheme = (): "light" | "dark" => {
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
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">(getPreferredTheme());
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const sankeyContainerRef = useRef<HTMLDivElement>(null);

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
    const handler = (e: MediaQueryListEvent) =>
      setTheme(e.matches ? "light" : "dark");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
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
    const handleClickOutside = (event: MouseEvent) => {
      if (
        speedMenuRef.current &&
        !speedMenuRef.current.contains(event.target as Node)
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

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentIndex(Number(e.target.value));
    setIsPlaying(false);
  };

  // Add this function to update the gauge indicator position
  const updateGauge = (speed: number) => {
    const indicator = document.getElementById("gauge-indicator");
    const angle = (speed - 0.5) * 180; // Map speed (0.5x to 2x) to 0-180 degrees
    const radians = (angle * Math.PI) / 180;
    const x = 12 + 10 * Math.sin(radians); // Center (12,12) + radius (10)
    const y = 12 - 10 * Math.cos(radians);
    if (indicator) {
      indicator.setAttribute("cx", x.toString());
      indicator.setAttribute("cy", y.toString());
    }
  };

  // Call updateGauge whenever speedMultiplier changes
  useEffect(() => {
    updateGauge(speedMultiplier);
  }, [speedMultiplier]);

  const handleSpeedChange = (multiplier: number) => {
    setSpeedMultiplier(multiplier);
    setShowSpeedMenu(false);
  };

  const handleSpeedSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSpeed = Number(e.target.value);
    setSpeedMultiplier(newSpeed);
  };

  // Reset animation to beginning
  const resetAnimation = () => {
    setCurrentIndex(0);
  };

  // Calculate estimated animation duration
  const calculateAnimationDuration = (): number => {
    if (snapshots.length === 0) return 0;
    return snapshots.length * (1000 / speedMultiplier);
  };

  const currentSnapshot = snapshots[currentIndex] || null;

  // Handle file upload
  const handleFileUpload = (
    file: File | { target: { files: FileList | null } }
  ) => {
    const actualFile = "target" in file ? file.target.files?.[0] : file;
    if (!actualFile) {
      setError("No file selected.");
      setFileInfo(null);
      return;
    }

    // Store file information
    setFileInfo({
      name: actualFile.name,
      size: actualFile.size,
      type: actualFile.type,
      lastModified: new Date(actualFile.lastModified).toLocaleString(),
    });

    const fileName = actualFile.name.toLowerCase();
    if (!fileName.endsWith(".json") && !fileName.endsWith(".csv")) {
      setError("Please upload a JSON or CSV file.");
      setSnapshots([]);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
      try {
        let parsedData: Snapshot[] = [];

        if (fileName.endsWith(".json")) {
          const jsonData = JSON.parse(e.target?.result as string);
          if (!Array.isArray(jsonData) || jsonData.length === 0) {
            throw new Error("JSON must be an array of snapshots.");
          }
          parsedData = jsonData;
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
          const csvData = Papa.parse(e.target?.result as string, {
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
          const columns = Object.keys(rows[0] as object);
          for (const col of requiredColumns) {
            if (!columns.includes(col)) {
              throw new Error(`CSV must contain '${col}' column.`);
            }
          }

          const framesMap = new Map<string, any[]>();
          rows.forEach((row: any) => {
            const timestamp = row.timestamp;
            if (!framesMap.has(timestamp)) {
              framesMap.set(timestamp, []);
            }
            framesMap.get(timestamp)?.push(row);
          });

          parsedData = Array.from(framesMap.entries()).map(
            ([timestamp, frameRows]) => {
              const nodeNames = new Set<string>();
              frameRows.forEach((row: any) => {
                nodeNames.add(row.source);
                nodeNames.add(row.target);
              });
              const nodes = Array.from(nodeNames).map((name) => ({
                name,
              }));

              const links = frameRows.map((row: any) => ({
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
            (a, b) =>
              new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
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
        setFileInfo((prev) =>
          prev
            ? {
                ...prev,
                snapshots: parsedData.length,
                nodes: parsedData[0]?.nodes.length || 0,
                links: parsedData[0]?.links.length || 0,
              }
            : null
        );

        setSnapshots(parsedData);
        setCurrentIndex(0);
        setIsPlaying(false);
        setError(null);
      } catch (err) {
        setError(`Invalid file format: ${(err as Error).message}`);
        setSnapshots([]);
      }
    };
    reader.onerror = () => {
      setError("Error reading the file.");
      setSnapshots([]);
    };
    reader.readAsText(actualFile);
  };

  // Dropzone file upload handler
  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      handleFileUpload(acceptedFiles[0]);
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
  const formatFileSize = (bytes: number): string => {
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
                  <svg
                    className="icon"
                    viewBox="0 0 24 24"
                    style={{ width: "24px", height: "24px" }}
                  >
                    {/* Outer circle (gauge background) */}
                    <circle
                      cx="12"
                      cy="12"
                      r="10"
                      fill="none"
                      stroke="#e0e0e0"
                      strokeWidth="2"
                    />
                    {/* Inner arc (gauge progress) */}
                    <path
                      d="M12 2 A10 10 0 0 1 22 12 A10 10 0 0 1 12 22"
                      fill="none"
                      stroke="#4a90e2"
                      strokeWidth="2"
                      strokeLinecap="round"
                      id="gauge-arc"
                    />
                    {/* Indicator dot */}
                    <circle
                      cx="12"
                      cy="2"
                      r="2"
                      fill="#4a90e2"
                      id="gauge-indicator"
                    />
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

              {/* Record Button */}
              {snapshots.length > 1 && (
                <RecordButton
                  targetRef={sankeyContainerRef as React.RefObject<HTMLElement>}
                  isPlaying={isPlaying}
                  setIsPlaying={setIsPlaying}
                  resetAnimation={resetAnimation}
                  duration={calculateAnimationDuration()}
                  theme={theme}
                  speedMultiplier={speedMultiplier}
                />
              )}
            </div>
          </div>
          <div ref={sankeyContainerRef} className={`sankey-container ${theme}`}>
            <ErrorBoundary>
              <SankeyDiagram
                snapshots={snapshots}
                currentIndex={currentIndex}
              />
            </ErrorBoundary>
          </div>
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
