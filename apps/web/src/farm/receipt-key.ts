/** Use one time-bearing identifier per new operation and reuse it on retry. */
export function createFarmReceiptKey(now = Date.now()): string {
  const time = now.toString(16).padStart(12, "0");
  return `${time.slice(0, 8)}-${time.slice(8)}-7${globalThis.crypto.randomUUID().slice(15)}`;
}
