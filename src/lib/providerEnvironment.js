export function normalizeProviderEnvironment(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['live', 'prod', 'production'].includes(raw)) return 'live';
  if (['sandbox', 'test', 'testing'].includes(raw)) return 'sandbox';
  return '';
}

export function matchesProviderEnvironment(row, activeEnvironment) {
  const active = normalizeProviderEnvironment(activeEnvironment);
  if (!active) return true;
  const rowEnvironment = normalizeProviderEnvironment(row?.environment || active);
  return rowEnvironment === active;
}
