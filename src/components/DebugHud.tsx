import { useEffect, useState } from "react";
import { api, type InfoOut } from "../api/commands";
import { transport } from "../lib/rpc";

export function DebugHud() {
  const [info, setInfo] = useState<InfoOut | null>(null);
  const [rttMs, setRttMs] = useState<number | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const started = performance.now();
      try {
        const next = await api.info();
        if (!alive) return;
        setInfo(next);
        setRttMs(Math.round(performance.now() - started));
        setOnline(true);
      } catch {
        if (alive) setOnline(false);
      }
    };
    void tick();
    const timer = window.setInterval(tick, 4000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  const forced = new URLSearchParams(window.location.search).get("debug");
  const visible = forced === "1" ? true : forced === "0" ? false : import.meta.env.DEV;
  if (!visible) return null;

  const status = online === null ? "checking" : online ? "online" : "offline";
  return (
    <aside className="debug-hud" data-testid="debug-hud" data-status={status}>
      <span className={`dot dot-${status}`} data-testid="debug-status" />
      <span data-testid="debug-transport">{transport()}</span>
      <span data-testid="debug-version">
        {info ? `v${info.version}(${info.gitHash})` : "v?"}
      </span>
      <span data-testid="debug-rtt">{online ? `${rttMs ?? "?"}ms` : "--"}</span>
    </aside>
  );
}
