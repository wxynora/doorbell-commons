import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { isMomentsPath, MOMENTS_PATH } from "../routes";
import type { MomentsPageProps } from "./moments-page";

const Page = lazy(() => import("./moments-page").then(module => ({ default: module.MomentsPage })));
function Opening({ onBack, failed = false }: { onBack(): void; failed?: boolean }) {
  return <div role={failed ? "alert" : "status"} style={{ position: "fixed", inset: 0, zIndex: 950, display: "grid", placeContent: "center", gap: 16, background: "#fff6e1", color: "#6e563b" }}><span>{failed ? "机哩咕噜画面没有打开，请返回后再试。" : "正在打开机哩咕噜…"}</span><button onClick={onBack}>返回社区</button></div>;
}
class PageBoundary extends Component<{ children: ReactNode; onBack(): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Opening onBack={this.props.onBack} failed /> : this.props.children; }
}
export function MomentsEntry(props: MomentsPageProps) {
  return <PageBoundary onBack={props.onBack}><Suspense fallback={<Opening onBack={props.onBack} />}><Page {...props} /></Suspense></PageBoundary>;
}
export function useMomentsNavigation() {
  const [open, setOpen] = useState(() => isMomentsPath(window.location.pathname));
  useEffect(() => {
    const sync = () => setOpen(isMomentsPath(window.location.pathname));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const show = useCallback(() => {
    if (!isMomentsPath(window.location.pathname)) window.history.pushState({ doorbellInternalPage: "moments" }, "", MOMENTS_PATH);
    setOpen(true);
  }, []);
  const close = useCallback(() => {
    if (window.history.state?.doorbellInternalPage === "moments") { window.history.back(); return; }
    window.history.replaceState({}, "", "/"); setOpen(false);
  }, []);
  return { open, show, close };
}
