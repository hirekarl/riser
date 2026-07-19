import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBuilding,
  createElevator,
  listBuildings,
  listElevators,
  listLedger,
  updateElevator,
} from "./client";
import type {
  Building,
  CreateBuildingPayload,
  CreateElevatorPayload,
  LedgerEntry,
} from "../types/domain";

function mockFetchOnce(body: unknown, init?: { ok?: boolean; status?: number }) {
  const ok = init?.ok ?? true;
  const status = init?.status ?? 200;
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("api client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("listBuildings GETs /buildings/ and returns parsed JSON", async () => {
    const buildings: Building[] = [
      {
        id: 1,
        name: "Tower A",
        address: "1 Main St",
        created_at: "2026-01-01",
        updated_at: "2026-01-01",
      },
    ];
    const fetchMock = mockFetchOnce(buildings);

    const result = await listBuildings();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/buildings\/?$/),
      expect.objectContaining({ method: "GET" }),
    );
    expect(result).toEqual(buildings);
  });

  it("listElevators GETs /elevators/", async () => {
    const fetchMock = mockFetchOnce([]);
    await listElevators();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/elevators\/?$/),
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("listLedger GETs /ledger/ and returns the entries in the order given", async () => {
    const entries: LedgerEntry[] = [
      {
        id: 1,
        building_name: "Tower A",
        device_identifier: "EL-1",
        inspection_type: "CAT1",
        last_inspection_date: "2020-01-01",
        due_date: "2021-01-01",
        status: "Delinquent",
      },
    ];
    mockFetchOnce(entries);
    const result = await listLedger();
    expect(result).toEqual(entries);
  });

  it("createBuilding POSTs the payload as JSON to /buildings/", async () => {
    const payload: CreateBuildingPayload = { name: "Tower B", address: "2 Main St" };
    const created: Building = {
      id: 2,
      ...payload,
      created_at: "2026-01-01",
      updated_at: "2026-01-01",
    };
    const fetchMock = mockFetchOnce(created);

    const result = await createBuilding(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/buildings\/?$/),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      }),
    );
    expect(result).toEqual(created);
  });

  it("createElevator POSTs the payload as JSON to /elevators/", async () => {
    const payload: CreateElevatorPayload = {
      building: 1,
      device_identifier: "EL-2",
      inspection_type: "CAT5",
      last_inspection_date: "2025-06-01",
    };
    const fetchMock = mockFetchOnce({ id: 5, ...payload, created_at: "x", updated_at: "x" });

    await createElevator(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/elevators\/?$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }),
    );
  });

  it("updateElevator PATCHes /elevators/:id/ with the partial payload", async () => {
    const fetchMock = mockFetchOnce({ id: 5 });

    await updateElevator(5, { last_inspection_date: "2026-05-01" });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/elevators\/5\/?$/),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ last_inspection_date: "2026-05-01" }),
      }),
    );
  });

  it("throws a descriptive error when the response is not ok", async () => {
    mockFetchOnce({ detail: "boom" }, { ok: false, status: 500 });
    await expect(listBuildings()).rejects.toThrow(/500/);
  });

  it("returns undefined for a 204 No Content response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await updateElevator(5, {});

    expect(result).toBeUndefined();
  });
});
