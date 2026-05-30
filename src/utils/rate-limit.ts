export function createRateLimiter(windowMs: number) {
  const lastSeenByUser = new Map<string, number>();

  return {
    isLimited(userId: string | number | bigint) {
      const key = userId.toString();
      const now = Date.now();
      const lastSeen = lastSeenByUser.get(key) ?? 0;

      if (now - lastSeen < windowMs) {
        return true;
      }

      lastSeenByUser.set(key, now);
      return false;
    },
  };
}
