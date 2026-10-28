import { useEffect, useState } from "react";

// Match the server's three-minute chart cache, independently of portfolio loads.
export default function useMarketHistoryRefresh() {
  const [refresh, setRefresh] = useState(() => Math.floor(Date.now() / 180_000));
  useEffect(() => {
    const update = () => {
      setRefresh(Math.floor(Date.now() / 180_000));
    };
    const timer = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);
  return String(refresh);
}
