export const API_ORIGIN = "https://blog-hub-backend-cnzm.onrender.com";

export function imageUrl(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, API_ORIGIN);
    return ["http:", "https:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function safeLink(value: string): boolean {
  try {
    return ["https:", "http:", "mailto:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map((part) => [...part][0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}

export function formatDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

export function mergeBlogs<T extends { id: string }>(
  current: T[],
  incoming: T[],
): T[] {
  return [
    ...new Map(
      [...current, ...incoming].map((item) => [item.id, item]),
    ).values(),
  ];
}

export function filterQuery(
  filters: Record<string, string | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value?.trim()) query.set(key, value.trim());
  }
  return query.toString();
}
