export function applyOrder(currentKeys, requestedKeys) {
  const known = new Set(currentKeys);
  const seen = new Set();
  const ordered = [];
  for (const key of Array.isArray(requestedKeys) ? requestedKeys : []) {
    if (known.has(key) && !seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  }
  for (const key of currentKeys) if (!seen.has(key)) ordered.push(key);
  return ordered;
}
