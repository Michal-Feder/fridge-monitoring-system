// Typed calls to the server. The types mirror the server's JSON (server/src/services/*); they are kept
// here so the client does not compile server code (node:sqlite) just to share types.
export type Level = 'red' | 'orange' | 'grey' | 'green';
export type Window = '7d' | '24h';

export interface Reason {
  level: Level | 'info';
  code: string;
  /** times are minutes since 1970 on the local wall clock (server core/time.ts) */
  params: Record<string, number | string | null>;
}

export interface DashboardFridge {
  id: number;
  branchId: number;
  branch: string;
  name: string;
  maxTemp: number;
  minTemp: number | null;
  level: Level;
  reasons: Reason[];
  currentLogger: string | null;
  lastReading: { ts: string; tempC: number | null; loggerId: string } | null;
}

export interface Dashboard {
  asOf: string | null;
  window: Window;
  windowStart: string | null;
  counts: Record<Level, number>;
  fridges: DashboardFridge[];
}

export class ApiError extends Error {}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError('offline');
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(body?.error ?? `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  dashboard: (window: Window) => request<Dashboard>(`/api/dashboard?window=${window}`),
};
