export function createSocketLimiter() {
  const buckets = new Map();
  return function allow(key, max, windowMs) {
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || now - b.start >= windowMs) {
      buckets.set(key, { start: now, count: 1 });
      return true;
    }
    b.count += 1;
    return b.count <= max;
  };
}
