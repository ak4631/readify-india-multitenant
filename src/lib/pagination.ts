export const PAGE_SIZE = 20;

export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

// Parses a 1-based ?page= value from searchParams. Anything missing or
// malformed falls back to the first page instead of throwing.
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function pageWindow(page: number, pageSize = PAGE_SIZE) {
  const size = Math.min(Math.max(Math.trunc(pageSize), 1), 100);
  const current = Math.max(Math.trunc(page) || 1, 1);
  return { page: current, pageSize: size, skip: (current - 1) * size, take: size };
}

export function toPage<T>(
  items: T[],
  total: number,
  window: { page: number; pageSize: number },
): Page<T> {
  return {
    items,
    total,
    page: window.page,
    pageSize: window.pageSize,
    pageCount: Math.max(Math.ceil(total / window.pageSize), 1),
  };
}

// For lists that must be assembled in memory (merged sources, aggregates).
export function slicePage<T>(rows: T[], page: number, pageSize = PAGE_SIZE) {
  const window = pageWindow(page, pageSize);
  return toPage(
    rows.slice(window.skip, window.skip + window.take),
    rows.length,
    window,
  );
}
