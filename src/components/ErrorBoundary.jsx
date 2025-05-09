import React from "react";

class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <p style={{ color: "red", textAlign: "center" }}>
          Something went wrong in the Sankey diagram. Check the console for
          details.
        </p>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
