export interface HalloweenCommand { op: string; args: Record<string, unknown>; requestId?: string }
export class ApiError extends Error { code: string; uncertain: boolean; constructor(code: string) }
export function command(op: string, args?: Record<string, unknown>): HalloweenCommand;
export function sendCommand<T = unknown>(payload: HalloweenCommand, options?: { keepalive?: boolean }): Promise<T>;
