export interface MidAutumnCake {
  filling: number;
  yolk: boolean;
  shape: "圆月" | "花朵" | "玉兔";
  pattern: "无" | "乌萨奇" | "小熊" | "Hello Kitty" | "狐狸" | "樱花" | "小雏菊" | "桂枝" | "足印" | "星星" | "弯月" | "星月" | "流云" | "自嘲熊" | "小八" | "布丁狗" | "大耳狗" | "美乐蒂";
  bake: number;
}
export interface MidAutumnGift {
  id: string;
  side: "ai" | "human";
  letter: string;
  status: "packed" | "sent";
  sentAt: number | null;
  cakes: { id: string; cake: MidAutumnCake }[];
}

export interface MidAutumnView {
  eventId: string;
  phase: "upcoming" | "unconfigured" | "open" | "ended";
  destination?: "memorial";
  opensAt?: number;
  deliveryAt?: number;
  closesAt?: number;
  options?: {
    fillings: { id: number; name: string }[];
    shapes: MidAutumnCake["shape"][];
    patterns: MidAutumnCake["pattern"][];
    yolk: boolean;
    bake: { min: number; max: number };
  };
  cakes?: { id: string; cake: MidAutumnCake }[];
  gifts: MidAutumnGift[];
}
export interface MidAutumnCommand {
  op: string;
  args: Record<string, unknown>;
  request_id?: string;
}
export class MidAutumnRejectedError extends Error {}

export function createMidAutumnCommand(op: string, args: Record<string, unknown>): MidAutumnCommand {
  return { op, args: structuredClone(args), request_id: crypto.randomUUID() };
}

export async function runMidAutumnCommand<T>(command: MidAutumnCommand): Promise<T> {
  const response = await fetch("/api/lingye/mid-autumn", {
    method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
  });
  const body = await response.json();
  if (!response.ok || body.ok !== true || !body.data) {
    const message = body.error?.message ?? body.message ?? "活动操作尚未确认，请重试同一次操作。";
    if ([400, 401, 403, 404, 409, 422].includes(response.status)) throw new MidAutumnRejectedError(message);
    throw new Error(message);
  }
  return body.data as T;
}

export const readMidAutumn = () => runMidAutumnCommand<MidAutumnView>({ op: "view", args: {} });
