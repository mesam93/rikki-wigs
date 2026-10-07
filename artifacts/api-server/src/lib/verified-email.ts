export function normalizedEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validClientEmail(value: string): string | null {
  const normalized = normalizedEmail(value);
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized : null;
}
