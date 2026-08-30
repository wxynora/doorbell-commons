import { Component, type ErrorInfo, type ReactNode } from "react";

export type FarmLazyStateMode = "page" | "surface";

export function FarmLazyLoading({
  label,
  mode = "surface",
}: {
  label: string;
  mode?: FarmLazyStateMode;
}) {
  return (
    <section className={`farm-lazy-state farm-lazy-state--${mode}`} role="status">
      <span aria-hidden="true" className="farm-lazy-state__sprout">
        ···
      </span>
      <p>{label}</p>
    </section>
  );
}

export function FarmLazyFailure({
  dismissLabel = "返回铃野",
  label,
  mode = "page",
  onDismiss,
}: {
  dismissLabel?: string;
  label: string;
  mode?: FarmLazyStateMode;
  onDismiss: () => void;
}) {
  return (
    <section className={`farm-lazy-state farm-lazy-state--${mode}`} role="alert">
      <div className="farm-lazy-state__note">
        <strong>画面没有打开</strong>
        <p>{label}</p>
        <button onClick={onDismiss} type="button">
          {dismissLabel}
        </button>
      </div>
    </section>
  );
}

export class FarmLazyBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Doorbell Farm lazy surface failed", error, info.componentStack);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
