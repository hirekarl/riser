import type {
  AddressLookupRequest,
  AddressLookupResponse,
  Building,
  CreateBuildingPayload,
  CreateElevatorPayload,
  Elevator,
  LedgerEntry,
  NarrationResponse,
  SeedDemoDataResponse,
  UpdateElevatorPayload,
} from "../types/domain";

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "/api";

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = joinUrl(API_BASE_URL, path);
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function listBuildings(): Promise<Building[]> {
  return request<Building[]>("buildings/", { method: "GET" });
}

export function listElevators(buildingId?: number): Promise<Elevator[]> {
  const path = buildingId === undefined ? "elevators/" : `elevators/?building=${buildingId}`;
  return request<Elevator[]>(path, { method: "GET" });
}

export function listLedger(buildingId?: number): Promise<LedgerEntry[]> {
  const path = buildingId === undefined ? "ledger/" : `ledger/?building=${buildingId}`;
  return request<LedgerEntry[]>(path, { method: "GET" });
}

export function createBuilding(payload: CreateBuildingPayload): Promise<Building> {
  return request<Building>("buildings/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function createElevator(payload: CreateElevatorPayload): Promise<Elevator> {
  return request<Elevator>("elevators/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateElevator(id: number, payload: UpdateElevatorPayload): Promise<Elevator> {
  return request<Elevator>(`elevators/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteElevator(id: number): Promise<void> {
  return request<void>(`elevators/${id}/`, { method: "DELETE" });
}

export function deleteBuilding(id: number): Promise<void> {
  return request<void>(`buildings/${id}/`, { method: "DELETE" });
}

// Backend endpoint not yet implemented (scheduled Sun 2026-07-26 per
// docs/sprints/day-by-day-plan.md) — added ahead per the pre-agreed contract
// in docs/architecture/integration-contracts.md §5. A non-200 response
// (e.g. the 503 "narration_unavailable" case) surfaces as a thrown error,
// same as every other request<T>() call here, for the panel component to catch.
export function fetchNarration(): Promise<NarrationResponse> {
  return request<NarrationResponse>("ledger/narration/", { method: "GET" });
}

// Backend endpoint not yet implemented (scheduled Mon 2026-07-27) — added
// ahead per docs/architecture/integration-contracts.md §3. Per that contract,
// "no match"/"no devices" cases are expected outcomes returned as HTTP 200
// with a `reason` field, not thrown errors — only a genuinely unexpected
// failure (e.g. malformed request) should reject this promise.
//
// Accepts a discriminated query rather than a bare string: `{ address }` for
// the initial lookup, `{ bin }` for the disambiguation re-call after the
// user picks a candidate from an `"ambiguous_match"` response. Exactly one
// of the two is ever present per request, per the contract doc.
// Always additive, never destructive — see docs/adr/0002-no-auth-for-mvp.md.
// GET on this path returns 405; only POST is supported.
export function seedDemoData(): Promise<SeedDemoDataResponse> {
  return request<SeedDemoDataResponse>("demo-data/seed/", { method: "POST" });
}

export function lookupBuildingByAddress(
  query: { address: string } | { bin: string },
): Promise<AddressLookupResponse> {
  const payload: AddressLookupRequest = query;
  return request<AddressLookupResponse>("buildings/lookup/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
