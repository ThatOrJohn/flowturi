import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
} from "react";
import { FrameData } from "../layout/computeLayout";

// Constants for WebSocket configuration
const DEFAULT_WS_URL = "ws://localhost:8082";
const HEARTBEAT_INTERVAL = 5000; // 5 seconds
const CONNECTION_TIMEOUT = 5000; // 5 seconds

interface WebSocketContextType {
  connect: (url: string) => void;
  disconnect: () => void;
  isConnected: boolean;
  lastMessage: FrameData | null;
  connectionStatus: "disconnected" | "connecting" | "connected" | "error";
  error: string | null;
}

// Create context for WebSocket state
const WebSocketContext = createContext<WebSocketContextType>({
  connect: () => {},
  disconnect: () => {},
  isConnected: false,
  lastMessage: null,
  connectionStatus: "disconnected",
  error: null,
});

// Hook to use WebSocket context
export const useWebSocket = () => useContext(WebSocketContext);

interface PersistentWebSocketProviderProps {
  children: React.ReactNode;
  onStreamData: (data: any) => void;
}

export const PersistentWebSocketProvider: React.FC<
  PersistentWebSocketProviderProps
> = ({ children, onStreamData }) => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<FrameData | null>(null);

  // WebSocket refs
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const manualDisconnectRef = useRef<boolean>(false);

  // Clean up all intervals and timeouts
  const cleanupTimers = useCallback(() => {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // Close WebSocket connection
  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;

    // Clean up timers
    cleanupTimers();

    // Close the WebSocket
    if (wsRef.current) {
      try {
        const ws = wsRef.current;
        console.log(`[PersistentWS] Closing WebSocket connection`);

        // Remove all event listeners
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;

        // Close the connection if not already closing/closed
        if (
          ws.readyState !== WebSocket.CLOSING &&
          ws.readyState !== WebSocket.CLOSED
        ) {
          ws.close(1000, "Manual disconnection");
        }

        wsRef.current = null;
      } catch (error) {
        console.error("[PersistentWS] Error closing WebSocket:", error);
      }
    }

    setIsConnected(false);
    setConnectionStatus("disconnected");
    setError(null);
  }, [cleanupTimers]);

  // Send heartbeat to keep connection alive
  const sendHeartbeat = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.log("[PersistentWS] Cannot send heartbeat - WebSocket not ready");
      return;
    }

    try {
      wsRef.current.send(JSON.stringify({ type: "heartbeat" }));
      console.log("[PersistentWS] Heartbeat sent");
    } catch (error) {
      console.error("[PersistentWS] Error sending heartbeat:", error);
    }
  }, []);

  // Start heartbeat interval
  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = setInterval(
      sendHeartbeat,
      HEARTBEAT_INTERVAL
    );
  }, [sendHeartbeat]);

  // Connect to WebSocket server
  const connect = useCallback(
    (url: string = DEFAULT_WS_URL) => {
      // First disconnect if already connected
      if (wsRef.current) {
        disconnect();
      }

      manualDisconnectRef.current = false;
      setConnectionStatus("connecting");
      setError(null);

      try {
        console.log(`[PersistentWS] Connecting to ${url}`);
        const ws = new WebSocket(url);
        wsRef.current = ws;

        // Set connection timeout
        connectTimeoutRef.current = setTimeout(() => {
          if (ws.readyState !== WebSocket.OPEN) {
            console.error("[PersistentWS] Connection timeout");
            setConnectionStatus("error");
            setError("Connection timeout");
            disconnect();
          }
        }, CONNECTION_TIMEOUT);

        // Connection opened handler
        ws.onopen = () => {
          console.log("[PersistentWS] Connection established");

          // Clear timeout
          if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
          }

          setIsConnected(true);
          setConnectionStatus("connected");
          setError(null);

          // Start heartbeat
          startHeartbeat();

          // Send initial heartbeat
          setTimeout(sendHeartbeat, 500);
        };

        // Message handler
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log("[PersistentWS] Message received:", data);

            // Handle info and heartbeat messages
            if (data.type === "info" || data.type === "heartbeat") {
              return;
            }

            // Process actual data
            if (data && data.timestamp && data.nodes && data.links) {
              // Store last message
              setLastMessage(data);

              // Pass to handler - this will be picked up by the WebSocketStream component
              // through the context's lastMessage property
              onStreamData(data);
            }
          } catch (error) {
            console.error("[PersistentWS] Error processing message:", error);
          }
        };

        // Error handler
        ws.onerror = (error) => {
          console.error("[PersistentWS] WebSocket error:", error);
          setConnectionStatus("error");
          setError("Connection error");
        };

        // Close handler
        ws.onclose = (event) => {
          console.log(
            `[PersistentWS] Connection closed: ${event.code} - ${
              event.reason || "No reason"
            }`
          );

          cleanupTimers();
          setIsConnected(false);

          if (!manualDisconnectRef.current) {
            setConnectionStatus("error");
            setError(`Connection closed (${event.code})`);

            // Auto-reconnect after a delay if not manually disconnected
            setTimeout(() => {
              if (!manualDisconnectRef.current) {
                console.log("[PersistentWS] Attempting to reconnect...");
                connect(url);
              }
            }, 3000);
          } else {
            setConnectionStatus("disconnected");
          }
        };
      } catch (error) {
        console.error("[PersistentWS] Error creating WebSocket:", error);
        setConnectionStatus("error");
        setError("Invalid WebSocket URL");
      }
    },
    [disconnect, startHeartbeat, sendHeartbeat, cleanupTimers, onStreamData]
  );

  // Clean up on unmount
  useEffect(() => {
    return () => {
      console.log("[PersistentWS] Provider unmounting, cleaning up");
      disconnect();
    };
  }, [disconnect]);

  // Provide WebSocket context
  const contextValue: WebSocketContextType = {
    connect,
    disconnect,
    isConnected,
    lastMessage,
    connectionStatus,
    error,
  };

  return (
    <WebSocketContext.Provider value={contextValue}>
      {children}
    </WebSocketContext.Provider>
  );
};

export default PersistentWebSocketProvider;
