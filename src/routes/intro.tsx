import { useEffect } from "react";
import { useLocation } from "wouter";
import { BrandIcon } from "../components/brand-icon";
import { getTelemetryClient } from "../telemetry/client";
import "./intro.css";

export function IntroRoute() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // app_open 텔레메트리 — fire-and-forget
    void getTelemetryClient().then((c) => c.track({ type: "app_open" }));
    const t = setTimeout(() => setLocation("/home"), 1500);
    return () => clearTimeout(t);
  }, [setLocation]);

  return (
    <main className="intro" aria-label="커피렌즈 시작 화면">
      <BrandIcon size={64} />
      <h1 className="text-display intro-title">커피렌즈</h1>
      <p className="text-caption intro-subtitle">동전 하나로 분쇄도 진단</p>
    </main>
  );
}
