import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** When this value changes (e.g. a new file or mode), a caught error is cleared */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  componentDidUpdate(prevProps: Props): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="error-fallback" role="alert">
          <h2>The diagram couldn't be drawn</h2>
          <p>
            Something in this data tripped up the renderer. Try again, or load a
            different file.
          </p>
          <details>
            <summary>Error details</summary>
            <code>{this.state.error.message}</code>
          </details>
          <button type="button" onClick={this.handleRetry}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
