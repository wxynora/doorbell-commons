import type { ServerResponse } from 'node:http';

/** Transport comments keep idle streams open without creating application events. */
export function startSseKeepalive(response: ServerResponse): void {
  const timer = setInterval(() => {
    if (response.destroyed || response.writableEnded) {
      clearInterval(timer);
      return;
    }
    response.write(': keepalive\n\n');
  }, 30_000);
  timer.unref();
  response.once('close', () => clearInterval(timer));
}
