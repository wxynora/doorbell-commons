export function decorationLeaseLabel(expiresAt?: string | null): string;
export function expiredDecorationIds(data: { inventory: { owned_quantity: number; expires_at?: string; item_id: string }[] } | null | undefined, now?: number): string[];
export function withoutExpiredLeaseData<T>(data: T, now?: number): T;
