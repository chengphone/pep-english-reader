export function createCustomHotspotId(page: number, usedIds: ReadonlySet<string>, timestamp: number, sequence: number): string {
  const base = `p${String(page).padStart(3, '0')}_custom_${timestamp}`
  let suffix = Math.max(0, Math.floor(sequence))
  let candidate = suffix === 0 ? base : `${base}_${suffix}`
  while (usedIds.has(candidate)) {
    suffix += 1
    candidate = `${base}_${suffix}`
  }
  return candidate
}
