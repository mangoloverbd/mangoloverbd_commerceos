import { Component, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback?: ReactNode;
};

type State = { hasError: boolean };

export class OrbErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("ThinkingOrb error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="inline-flex h-9 items-center gap-2 rounded-full border border-black/[0.08] bg-black/[0.02] px-3">
            <div className="size-5 animate-pulse rounded-full bg-black/10" />
            <span
              className="whitespace-nowrap text-xs leading-[14px]"
              style={{ color: "rgba(17,17,17,0.5)" }}
            >
              Agent working…
            </span>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
