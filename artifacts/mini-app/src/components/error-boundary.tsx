import { Component, type ReactNode } from "react";
import { getErrorMessage, isChunkLoadError } from "@/lib/chunk-reload";

type Props = { children: ReactNode };
type State = { hasError: boolean; error?: Error };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      const message = getErrorMessage(this.state.error);
      const isStaleBundle = isChunkLoadError(this.state.error);

      return (
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
            <span className="text-destructive font-bold text-xl">!</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {isStaleBundle ? "App updated. Reload to continue." : message}
          </p>
          <button
            onClick={() => {
              if (isStaleBundle) {
                window.location.reload();
                return;
              }
              this.setState({ hasError: false });
            }}
            className="text-sm text-primary underline"
          >
            {isStaleBundle ? "Reload" : "Try again"}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
