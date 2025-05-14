import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { PersistentWebSocketProvider } from "./components/PersistentWebSocketProvider";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Failed to find the root element");

// Wrap the App with PersistentWebSocketProvider to enable WebSocket functionality
const AppWithWebSocketProvider = () => {
  return (
    <PersistentWebSocketProvider
      onStreamData={(data) => {
        // The provider needs an onStreamData prop, but the actual handling will be done
        // by the WebSocketStream component that accesses the context
        console.log(
          "[WebSocket Provider] Data received, will be processed by components"
        );
      }}
    >
      <App />
    </PersistentWebSocketProvider>
  );
};

createRoot(rootElement).render(
  <StrictMode>
    <AppWithWebSocketProvider />
  </StrictMode>
);
