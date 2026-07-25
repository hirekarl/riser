import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBuilding,
  createElevator,
  fetchNarration,
  listBuildings,
  listElevators,
  listLedger,
  lookupBuildingByAddress,
  updateElevator,
} from "./client";
import type {
  AddressLookupResponse,
  Building,
  CreateBuildingPayload,
  CreateElevatorPayload,
  LedgerEntry,
  NarrationResponse,
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

  it("listElevators GETs /elevators/?building=<id> when a buildingId is given", async () => {
    const fetchMock = mockFetchOnce([]);
    await listElevators(3);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/elevators\/\?building=3$/),
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

  it("listLedger GETs /ledger/?building=<id> when a buildingId is given", async () => {
    const fetchMock = mockFetchOnce([]);
    await listLedger(3);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/ledger\/\?building=3$/),
      expect.objectContaining({ method: "GET" }),
    );
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

  it("fetchNarration GETs /ledger/narration/ and returns parsed JSON", async () => {
    const narration: NarrationResponse = {
      narration: "3 elevators are Delinquent, 2 enter Warning this week.",
      generated_at: "2026-07-26T14:32:00Z",
    };
    const fetchMock = mockFetchOnce(narration);

    const result = await fetchNarration();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/ledger\/narration\/?$/),
      expect.objectContaining({ method: "GET" }),
    );
    expect(result).toEqual(narration);
  });

  it("fetchNarration throws when the narration service is unavailable", async () => {
    mockFetchOnce({ error: "narration_unavailable" }, { ok: false, status: 503 });
    await expect(fetchNarration()).rejects.toThrow(/503/);
  });

  it("lookupBuildingByAddress POSTs the address as JSON to /buildings/lookup/", async () => {
    const response: AddressLookupResponse = {
      match: { bin: "1001686", resolved_address: "350 5 AVENUE", borough: "MANHATTAN" },
      devices: [
        {
          device_number: "1P766",
          device_status: "Active",
          cat1_latest_report_filed: "2026-03-01",
          cat5_latest_report_filed: null,
          periodic_latest_inspection: "2026-03-01",
        },
      ],
      reason: null,
    };
    const fetchMock = mockFetchOnce(response);

    const result = await lookupBuildingByAddress("350 Fifth Avenue, Manhattan");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/buildings\/lookup\/?$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ address: "350 Fifth Avenue, Manhattan" }),
      }),
    );
    expect(result).toEqual(response);
  });

  it("lookupBuildingByAddress resolves (not throws) on a no-match reason, per the 200-with-reason contract", async () => {
    const response: AddressLookupResponse = { match: null, devices: [], reason: "address_not_found" };
    mockFetchOnce(response);

    await expect(lookupBuildingByAddress("nonexistent address")).resolves.toEqual(response);
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
