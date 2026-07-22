import type {
  Building,
  CreateBuildingPayload,
  CreateElevatorPayload,
  Elevator,
  LedgerEntry,
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

export function listLedger(): Promise<LedgerEntry[]> {
  return request<LedgerEntry[]>("ledger/", { method: "GET" });
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
