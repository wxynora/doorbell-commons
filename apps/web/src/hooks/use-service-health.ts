import type { ServiceHealth } from "@doorbell/protocol";
import { useEffect, useState } from "react";
import type { ConnectionState } from "../view-models";

export function useServiceHealth(): ConnectionState {
  const [connection, setConnection] = useState<ConnectionState>("checking");

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/health", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Health request failed with ${response.status}`);
        }

        return (await response.json()) as ServiceHealth;
      })
      .then((health) => {
        setConnection(
          health.service === "doorbell-commons" && health.status === "ok" ? "online" : "offline",
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setConnection("offline");
      });

    return () => {
      controller.abort();
    };
  }, []);

  return connection;
}
