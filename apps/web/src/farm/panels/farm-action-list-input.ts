export function formatActionListDateInput(value: string): string {
  return value.replace(/\D/gu, "").slice(0, 8);
}

export function formatActionListTimeInput(value: string): string {
  return value.replace(/\D/gu, "").slice(0, 4);
}

export function normalizeActionListDateInput(value: string): string {
  const digits = formatActionListDateInput(value);
  if (digits.length !== 8) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export function normalizeActionListTimeInput(value: string): string {
  const digits = formatActionListTimeInput(value);
  if (digits.length !== 4) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}
