import React, { useState, useEffect } from "react";
import { FrameData } from "../layout/computeLayout";
import { useWebSocket } from "./PersistentWebSocketProvider";
import "./WebSocketStream.css";

// Constants for WebSocket configuration
const DEFAULT_WS_URL = "ws://localhost:8082";

interface WebSocketStreamProps {
  onStreamData: (data: any) => void;
  onConnectionStatusChange?: (
    status: "disconnected" | "connecting" | "connected" | "error"
  ) => void;
  theme: "light" | "dark";
  latestFrame?: FrameData | null;
}

interface StreamInfo {
  status: "disconnected" | "connecting" | "connected" | "error";
  lastMessage?: Date;
  messagesReceived: number;
  error?: string;
  avgMessageSize: number;
  totalDataReceived: number;
}

const WebSocketStream: React.FC<WebSocketStreamProps> = ({
  onStreamData,
  onConnectionStatusChange,
  theme,
  latestFrame,
}) => {
  // Use WebSocket Context
  const {
    connect,
    disconnect,
    isConnected,
    connectionStatus,
    error: wsError,
    lastMessage,
  } = useWebSocket();

  const [wsUrl, setWsUrl] = useState<string>(DEFAULT_WS_URL);
  const [streamInfo, setStreamInfo] = useState<StreamInfo>({
    status: "disconnected",
    messagesReceived: 0,
    avgMessageSize: 0,
    totalDataReceived: 0,
  });

  // Pass lastMessage from WebSocket context to onStreamData when it changes
  useEffect(() => {
    if (lastMessage) {
      console.log("[WebSocketStream] Passing new message to App");
      onStreamData(lastMessage);
    }
  }, [lastMessage, onStreamData]);

  // Update connection status for parent component
  useEffect(() => {
    if (onConnectionStatusChange) {
      onConnectionStatusChange(connectionStatus);
    }

    // Update stream info based on WebSocket context
    setStreamInfo((prev) => ({
      ...prev,
      status: connectionStatus,
      error: wsError || undefined,
    }));
  }, [connectionStatus, onConnectionStatusChange, wsError]);

  // Format bytes to human-readable format
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    else return (bytes / 1048576).toFixed(1) + " MB";
  };

  // Get formatted timestamp
  const getFormattedTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    } catch (e) {
      return timestamp;
    }
  };

  // Get node counts by type
  const getNodeCounts = () => {
    if (!latestFrame)
      return { sources: 0, intermediates: 0, sinks: 0, total: 0 };

    const nodes = latestFrame.nodes || [];
    const links = latestFrame.links || [];

    // Identify node types based on connections
    const sources: string[] = [];
    const sinks: string[] = [];
    const intermediates: string[] = [];

    // First identify source and sink nodes
    const allNodeNames = nodes.map((n) => n.name);
    const nodesWithIncoming = new Set(links.map((l) => l.target));
    const nodesWithOutgoing = new Set(links.map((l) => l.source));

    allNodeNames.forEach((name) => {
      const hasIncoming = nodesWithIncoming.has(name);
      const hasOutgoing = nodesWithOutgoing.has(name);

      if (!hasIncoming && hasOutgoing) {
        sources.push(name);
      } else if (hasIncoming && !hasOutgoing) {
        sinks.push(name);
      } else {
        intermediates.push(name);
      }
    });

    return {
      sources: sources.length,
      intermediates: intermediates.length,
      sinks: sinks.length,
      total: nodes.length,
    };
  };

  // Calculate total flow volume
  const getTotalFlow = () => {
    if (!latestFrame || !latestFrame.links) return 0;
    return latestFrame.links.reduce((sum, link) => sum + link.value, 0);
  };

  const nodeCounts = getNodeCounts();
  const totalFlow = getTotalFlow();

  // Stream Configuration Panel
  const streamConfigPanel = (
    <div className={`stream-config-panel ${theme}`}>
      <h3>Stream Configuration</h3>
      <div className="stream-info-description">
        Enter the WebSocket URL of your data source and click Connect. The
        WebSocket server should provide data in the expected format.
      </div>
      <div className="stream-config-form">
        <div className="form-group">
          <label htmlFor="wsUrl">WebSocket URL:</label>
          <input
            type="text"
            id="wsUrl"
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            placeholder="ws://your-data-source:port"
            disabled={isConnected}
            className={theme}
          />
        </div>

        <div className="form-group">
          <label className="checkbox-label">
            <input type="checkbox" checked={true} readOnly disabled={true} />
            Auto-reconnect
          </label>
        </div>

        <div className="stream-control-buttons">
          {!isConnected ? (
            <button
              className={`connect-button ${theme}`}
              onClick={() => connect(wsUrl)}
              disabled={connectionStatus === "connecting"}
            >
              {connectionStatus === "connecting" ? `Connecting...` : "Connect"}
            </button>
          ) : (
            <button
              className={`disconnect-button ${theme}`}
              onClick={disconnect}
            >
              Disconnect
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Frame Information Section
  const frameInfoPanel = latestFrame && (
    <div className="frame-info-container">
      <h4>Latest Frame</h4>
      <div className="frame-info">
        <div className="stream-stat-item">
          <span className="stat-label">Timestamp:</span>
          <span className="stat-value">
            {getFormattedTimestamp(latestFrame.timestamp)}
          </span>
        </div>

        {latestFrame.tick !== undefined && (
          <div className="stream-stat-item">
            <span className="stat-label">Tick:</span>
            <span className="stat-value">{latestFrame.tick}</span>
          </div>
        )}

        <div className="stream-stat-item">
          <span className="stat-label">Nodes:</span>
          <span className="stat-value">
            {nodeCounts.total}
            <span className="node-type-counts">
              ({nodeCounts.sources} src, {nodeCounts.intermediates} int,{" "}
              {nodeCounts.sinks} sink)
            </span>
          </span>
        </div>

        <div className="stream-stat-item">
          <span className="stat-label">Links:</span>
          <span className="stat-value">{latestFrame.links?.length || 0}</span>
        </div>

        <div className="stream-stat-item">
          <span className="stat-label">Total Flow:</span>
          <span className="stat-value">{totalFlow.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );

  // Stream Information Panel
  const streamInfoPanel = (
    <div className={`stream-info-panel ${theme}`}>
      <h3>Stream Information</h3>

      {streamInfo.error && (
        <div className="stream-error-message">{streamInfo.error}</div>
      )}

      <div className="stream-status">
        <div className="status-indicator">
          <div className={`status-dot ${streamInfo.status}`}></div>
          <span>
            Status:{" "}
            {streamInfo.status.charAt(0).toUpperCase() +
              streamInfo.status.slice(1)}
          </span>
        </div>
      </div>

      <div className="stream-stats">
        <div className="stream-stat-item">
          <span className="stat-label">Connection:</span>
          <span className="stat-value">
            {isConnected ? "Active" : "Inactive"}
          </span>
        </div>

        <div className="stream-stat-item">
          <span className="stat-label">Last Message:</span>
          <span className="stat-value">
            {streamInfo.lastMessage
              ? streamInfo.lastMessage.toLocaleTimeString()
              : "None"}
          </span>
        </div>
      </div>

      {frameInfoPanel}
    </div>
  );

  return (
    <>
      {streamConfigPanel}
      {streamInfoPanel}
    </>
  );
};

export default WebSocketStream;
