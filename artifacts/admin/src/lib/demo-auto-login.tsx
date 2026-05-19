import { useEffect, useState, type ReactNode } from "react";
import { buildApiUrl } from "@/lib/api";

const DEMO_CREDENTIALS = { telegramId: "demo", password: "demo" };

async function attemptDemoLogin(): Promise<boolean> {
  try {
    const res = await fetch(buildApiUrl("/api/auth/login"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(DEMO_CREDENTIALS),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (!data?.token) return false;
    localStorage.setItem("auth_token", data.token);
    return true;
  } catch {
    return false;
  }
}

export function DemoAutoLoginGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(() => Boolean(localStorage.getItem("auth_token")));

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    attemptDemoLogin().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (!ready) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
