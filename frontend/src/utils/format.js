export function formatDateTime(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function parseTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
