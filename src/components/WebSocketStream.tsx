import React, { useState, useEffect, useCallback, useRef } from "react";
import "./WebSocketStream.css";

interface WebSocketStreamProps {
  onStreamData: (data: any) => void;
  theme: "light" | "dark";
}

interface StreamInfo {
  status: "disconnected" | "connecting" | "connected" | "error";
  lastMessage?: Date;
  messagesReceived: number;
  error?: string;
  avgMessageSize: number;
  totalDataReceived: number;
}

const DEFAULT_WS_URL = "ws://localhost:8082";

const WebSocketStream: React.FC<WebSocketStreamProps> = ({
  onStreamData,
  theme,
}) => {
  const [wsUrl, setWsUrl] = useState<string>(DEFAULT_WS_URL);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [streamInfo, setStreamInfo] = useState<StreamInfo>({
    status: "disconnected",
    messagesReceived: 0,
    avgMessageSize: 0,
    totalDataReceived: 0,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const connectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Format bytes to human-readable format
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    else return (bytes / 1048576).toFixed(1) + " MB";
  };

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close();
    }

    // Update status to connecting
    setStreamInfo((prev) => ({
      ...prev,
      status: "connecting",
      error: undefined,
    }));

    // Create a new WebSocket connection
    try {
      wsRef.current = new WebSocket(wsUrl);

      // Set a timeout for connection
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
      }

      connectTimeoutRef.current = setTimeout(() => {
        if (wsRef.current && wsRef.current.readyState !== WebSocket.OPEN) {
          setStreamInfo((prev) => ({
            ...prev,
            status: "error",
            error:
              "Connection timeout. Please check the WebSocket URL and try again.",
          }));
          wsRef.current.close();
        }
      }, 5000);

      // WebSocket event handlers
      wsRef.current.onopen = () => {
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }

        setIsConnected(true);
        setStreamInfo((prev) => ({
          ...prev,
          status: "connected",
          error: undefined,
          lastMessage: new Date(),
        }));
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onStreamData(data);

          // Update stream info
          setStreamInfo((prev) => {
            const messageSize = event.data.length;
            const newTotalReceived = prev.totalDataReceived + messageSize;
            const newCount = prev.messagesReceived + 1;

            return {
              ...prev,
              lastMessage: new Date(),
              messagesReceived: newCount,
              avgMessageSize: Math.round(newTotalReceived / newCount),
              totalDataReceived: newTotalReceived,
            };
          });
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
          setStreamInfo((prev) => ({
            ...prev,
            error: "Invalid data format received",
          }));
        }
      };

      wsRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        setIsConnected(false);
        setStreamInfo((prev) => ({
          ...prev,
          status: "error",
          error:
            "Connection error. Please check the WebSocket URL and try again.",
        }));
      };

      wsRef.current.onclose = () => {
        setIsConnected(false);
        setStreamInfo((prev) => ({
          ...prev,
          status: "disconnected",
        }));
      };
    } catch (error) {
      console.error("Error creating WebSocket:", error);
      setStreamInfo((prev) => ({
        ...prev,
        status: "error",
        error: "Invalid WebSocket URL. Please check the URL and try again.",
      }));
    }
  }, [wsUrl, onStreamData]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
    setStreamInfo((prev) => ({
      ...prev,
      status: "disconnected",
    }));
  }, []);

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Stream Configuration Panel
  const streamConfigPanel = (
    <div className={`stream-config-panel ${theme}`}>
      <h3>Stream Configuration</h3>
      <div className="stream-config-form">
        <div className="form-group">
          <label htmlFor="wsUrl">WebSocket URL:</label>
          <input
            type="text"
            id="wsUrl"
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            placeholder="ws://localhost:8082"
            disabled={isConnected}
            className={theme}
          />
        </div>

        <div className="stream-control-buttons">
          {!isConnected ? (
            <button
              className={`connect-button ${theme}`}
              onClick={connect}
              disabled={streamInfo.status === "connecting"}
            >
              {streamInfo.status === "connecting" ? "Connecting..." : "Connect"}
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
          <span className="stat-label">Messages Received:</span>
          <span className="stat-value">{streamInfo.messagesReceived}</span>
        </div>

        <div className="stream-stat-item">
          <span className="stat-label">Last Message:</span>
          <span className="stat-value">
            {streamInfo.lastMessage
              ? streamInfo.lastMessage.toLocaleTimeString()
              : "None"}
          </span>
        </div>

        <div className="stream-stat-item">
          <span className="stat-label">Avg. Message Size:</span>
          <span className="stat-value">
            {formatBytes(streamInfo.avgMessageSize)}
          </span>
        </div>

        <div className="stream-stat-item">
          <span className="stat-label">Total Data Received:</span>
          <span className="stat-value">
            {formatBytes(streamInfo.totalDataReceived)}
          </span>
        </div>
      </div>
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
