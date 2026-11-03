const listeners = new Set<(userId: string, server: boolean) => void>();
export function notifyPostChange(userId: string, server = false) {
  for (const listener of listeners) listener(userId, server);
}
export function subscribePostChanges(
  listener: (userId: string, server: boolean) => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
