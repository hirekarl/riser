import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { logError } from "../lib/logger";
import styles from "./ErrorBoundary.module.css";

export interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Last-resort net for uncaught render errors in the subtree it wraps. Must
 * be a class component: `getDerivedStateFromError`/`componentDidCatch` have
 * no function-component equivalent in React's error boundary API.
 *
 * "Try again" resets local state (not a hard `location.reload()`), so a
 * transient render error (e.g. bad data for one row) can be recovered from
 * without losing the rest of the app's in-memory state.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logError("Uncaught render error", error, { componentStack: info.componentStack });
  }

  handleTryAgain = (): void => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.fallback} role="alert">
          <p>Something went wrong. Please try again.</p>
          <button type="button" onClick={this.handleTryAgain}>
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
