# Frontend ↔ backend contracts & external API integration spec

Companion to `docs/prd/Riser-PRD.md` (requirements) and `docs/sprints/day-by-day-plan.md` (schedule). This document is the single source of truth for exact request/response shapes — the schedule references it rather than repeating shapes inline, so there's one place to update when a contract changes.

## 1. Current contract (baseline, already implemented)

Verified directly against `backend/apps/compliance/{models,serializers,views,urls}.py` and `frontend/src/{types/domain.ts,api/client.ts}` on 2026-07-21 — this section describes what exists today, not a proposal.

### Building

- `GET /api/buildings/`, `POST /api/buildings/`, `GET/PATCH/PUT/DELETE /api/buildings/{id}/` — standard DRF `ModelViewSet`.
- Shape (`BuildingSerializer` ↔ `Building` in `domain.ts`): `{ id, name, address, created_at, updated_at }`. `id`/`created_at`/`updated_at` are read-only.
- Client: `listBuildings()`, `createBuilding(payload: CreateBuildingPayload)` in `client.ts`. No `updateBuilding`/`deleteBuilding` yet (P1/P2, not built).

### Elevator

- `GET /api/elevators/` (supports `?building=<id>` filter — already implemented in `ElevatorViewSet.get_queryset`), `POST /api/elevators/`, `GET/PATCH/PUT/DELETE /api/elevators/{id}/`.
- Shape (`ElevatorSerializer` ↔ `Elevator`): `{ id, building, device_identifier, inspection_type, last_inspection_date, created_at, updated_at }`.
- Client: `listElevators()`, `createElevator(payload: CreateElevatorPayload)`, `updateElevator(id, payload: UpdateElevatorPayload)`.
- **Correction to the day-by-day plan's assumption:** editing an elevator (`PATCH`) is **already fully wired end-to-end** — the backend `ModelViewSet` supports it and the frontend already has `updateElevator` + `UpdateElevatorPayload`. Tue night's "confirm the API supports editing" task will very likely find nothing to build at the API layer — the real remaining work is just whether `ElevatorForm.tsx` calls `updateElevator` in an edit mode, which is a UI question, not a contract question.
- **Gap that does need building:** `listElevators()` doesn't currently accept a `building` param (the backend supports the filter; the client function doesn't expose it yet). Small addition: `listElevators(buildingId?: number)`.

### Ledger (read-only)

- `GET /api/ledger/` — `LedgerListView`, unpaginated, pre-sorted (Delinquent > Warning > Compliant, then ascending due date). Sorting happens in Python because `due_date`/`status` are computed, not stored columns.
- Shape (`LedgerEntrySerializer` ↔ `LedgerEntry`): `{ id, device_identifier, inspection_type, last_inspection_date, building_name, due_date, status }`. Deliberately omits `building` (FK id), `created_at`, `updated_at`.
- Client: `listLedger()`.
- **Real gap:** unlike `ElevatorViewSet`, `LedgerListView` does **not** support `?building=` filtering — it calls `self.filter_queryset(self.get_queryset())` but no `filter_backends`/filterset is configured, so that call is currently a no-op. This is the actual backend work behind "filter/group ledger by building" (Wed 7/22, Cornell) — add a `building` query-param filter to `LedgerListView` the same way `ElevatorViewSet` already does it, then update `listLedger(buildingId?: number)` to match.

## 2. New contract: ledger building filter

- `GET /api/ledger/?building=<id>` — same response shape as the unfiltered ledger, restricted to one building.
- `listLedger(buildingId?: number): Promise<LedgerEntry[]>` — append `?building=` only when provided.
- No new model fields, no TS type changes (same `LedgerEntry` shape).

## 3. New contract: address lookup / DOB auto-populate

Proposed as a custom action on `BuildingViewSet` rather than a new top-level resource, since it's building-scoped and doesn't persist anything itself:

**`POST /api/buildings/lookup/`**

Request:

```json
{ "address": "350 Fifth Avenue, Manhattan" }
```

Response — match found:

```json
{
  "match": {
    "bin": "1001686",
    "resolved_address": "350 5 AVENUE",
    "borough": "MANHATTAN"
  },
  "devices": [
    {
      "device_number": "...",
      "device_status": "...",
      "cat1_latest_report_filed": "2026-03-01",
      "cat5_latest_report_filed": null,
      "periodic_latest_inspection": "2026-03-01"
    }
  ],
  "reason": null
}
```

Response — address resolved but DOB has no devices on file:

```json
{
  "match": { "bin": "...", "resolved_address": "...", "borough": "..." },
  "devices": [],
  "reason": "no_devices_on_file"
}
```

Response — address didn't resolve to a BIN at all:

```json
{ "match": null, "devices": [], "reason": "address_not_found" }
```

Response — upstream service (geocoder or Socrata) unavailable:

```json
{ "match": null, "devices": [], "reason": "upstream_unavailable" }
```

**Design choice:** always return HTTP 200 with a `reason` field rather than 4xx/5xx for the "no match"/"no devices" cases — these are expected, user-facing outcomes the frontend needs to branch on gracefully (fall back to manual entry), not exceptional errors. Reserve a non-200 status for genuinely unexpected failures (malformed request body, etc.).

**This endpoint is read-only/preview — it does not persist anything.** The frontend takes the response, lets the user review/override each device in the list, then calls the _existing_ `POST /api/buildings/` + `POST /api/elevators/` endpoints to actually save — same validation, same code path, same tests as manual entry. This avoids needing a bulk-create endpoint and keeps the write path identical regardless of how the data originated.

TS types to add in `domain.ts`:

```ts
export interface AddressLookupRequest {
  address: string;
}

export interface DobDeviceMatch {
  device_number: string;
  device_status: string;
  cat1_latest_report_filed: string | null;
  cat5_latest_report_filed: string | null;
  periodic_latest_inspection: string | null;
}

export interface AddressLookupResponse {
  match: { bin: string; resolved_address: string; borough: string } | null;
  devices: DobDeviceMatch[];
  reason:
    | "address_not_found"
    | "no_devices_on_file"
    | "upstream_unavailable"
    | null;
}
```

Client: `lookupBuildingByAddress(address: string): Promise<AddressLookupResponse>`.

### New model fields this implies

Neither `Building` nor `Elevator` currently distinguish DOB-sourced data from manual entry, or cache the resolved BIN. To support review/override now and the "refresh from DOB" P2 later:

- `Building.bin` — nullable `CharField`, cached resolved BIN (avoids re-geocoding on refresh).
- `Elevator.dob_device_number` — nullable `CharField`, the raw DOB `device_number` if this row came from the feed.
- `Elevator.data_source` — `TextChoices` (`"manual"` / `"dob_open_data"`), optional P2, needed once "refresh from DOB" exists so the refresh logic knows which rows it's allowed to overwrite.

These are additive nullable fields — no migration risk to existing manually-entered rows.

## 4. External API integration pipeline (backend-only — the frontend never calls these directly)

Three independent stages, each behind its own small service function so any one can be mocked in tests or swapped later:

```text
address (from frontend)
   │
   ▼
resolve_address_to_bin(address) ──► BIN
   │
   ▼
fetch_dob_devices_for_bin(bin) ──► list[DobDeviceRecord]
   │
   ▼
map_dob_devices_to_drafts(records) ──► list[ElevatorDraft]   (shape matches CreateElevatorPayload)
   │
   ▼
POST /api/buildings/lookup/ response
```

### Stage 1 — address → BIN (⚠️ reachability unconfirmed)

The PRD assumed NYC Planning's **GeoSearch API** (`geosearch.planninglabs.nyc`) — documented as free, keyless, Pelias-based. A live check during this revision (2026-07-21) hit **HTTP 410 Gone** on its `/v1/search` endpoint, while the service's own landing page showed no deprecation notice — the true status is unresolved from outside research alone. NYC Planning's current, actively-documented replacement, the **Geoservice API** (`geoservice.planning.nyc.gov`), does the same address/BIN/BBL resolution but requires a registered API key (`Key` parameter) — registration lead time unknown.

**This is a real risk to the 7/27 start of DOB integration work**, not a settled fact. Action: Cornell's Friday 7/24 research slot (see day-by-day plan) must confirm which service is actually callable before Monday. Fallback if neither is quickly usable: let the user type a BIN directly as a degraded manual path (loses the "address-first" UX but keeps the DOB auto-populate value), or cut the feature entirely per the day-by-day plan's cut order — the P0/P1 core does not depend on this.

Interface (stable regardless of which service ends up behind it):

```python
def resolve_address_to_bin(address: str) -> ResolvedAddress | None:
    """Return the resolved BIN/address/borough, or None if no confident match."""
```

### Stage 2 — BIN → DOB devices (confirmed working)

`GET https://data.cityofnewyork.us/resource/e5aq-a4j2.json?bin=<bin>` — NYC Open Data Socrata SODA API, **no authentication required**, confirmed reachable during this revision. Relevant fields on each returned row: `device_number`, `device_status`, `cat1_latest_report_filed`, `cat5_latest_report_filed`, `periodic_latest_inspection`, plus `bin`/`borough`/`house_number`/`street_name` (address fields, useful for double-checking the geocoder's match).

```python
def fetch_dob_devices_for_bin(bin: str) -> list[DobDeviceRecord]:
    """GET the Socrata dataset filtered to one BIN; raises on non-2xx."""
```

Open item (non-blocking): whether to provision a Socrata app token for higher rate limits, or rely on anonymous access — fine at demo scale either way, per the PRD's open questions.

### Stage 3 — mapping to elevator drafts (pure function, no I/O)

```python
def map_dob_devices_to_drafts(records: list[DobDeviceRecord]) -> list[ElevatorDraft]:
    """Pick whichever of cat1_latest_report_filed / cat5_latest_report_filed is
    populated as last_inspection_date, infer inspection_type from which field
    that was, and carry device_number through as dob_device_number."""
```

Where this lives: new modules alongside the existing `services.py` — e.g. `backend/apps/compliance/services/geocoding.py` and `backend/apps/compliance/services/dob_lookup.py` (or flat `geocoding.py`/`dob_lookup.py` next to `services.py` if the team prefers not to introduce a package — Cornell's call, he owns this code). The `/api/buildings/lookup/` view composes stages 1→2→3.

**Testing:** mock the HTTP layer (`httpx`/`requests`) at each service function's boundary in the unit test suite — never hit the real network in CI. An optional manual smoke-test script (not part of CI, not test-covered) can hit the real APIs during development to confirm reachability, separate from the mocked unit tests that satisfy the 90% coverage gate.

## 5. New contract: AI narration

**`GET /api/ledger/narration/`** — read-only, on-demand, no request body (the backend derives everything it needs from current ledger state).

Response — normal case:

```json
{
  "narration": "3 elevators are Delinquent, 2 enter Warning this week — prioritize EL-3 at Tower A first.",
  "generated_at": "2026-07-26T14:32:00Z"
}
```

Response — empty portfolio (handled locally, **does not call the Claude API** — no point spending a model call narrating nothing):

```json
{
  "narration": "No elevators tracked yet.",
  "generated_at": "2026-07-26T14:32:00Z"
}
```

Response — Claude API call fails or times out:

```json
{ "error": "narration_unavailable" }
```

(HTTP 503.) The frontend shows a graceful inline message and never blocks the rest of the ledger on this — narration is additive, not load-bearing.

TS types:

```ts
export interface NarrationResponse {
  narration: string;
  generated_at: string;
}

export interface NarrationErrorResponse {
  error: "narration_unavailable";
}
```

Client: `fetchNarration(): Promise<NarrationResponse>` (let a non-200 response surface as a thrown error the panel component catches, consistent with how `request<T>()` in `client.ts` already handles non-ok responses).

### Implementation notes

- New module, e.g. `backend/apps/compliance/services/narration.py`: `generate_narration(entries: list[LedgerEntry]) -> str`, using the `anthropic` Python SDK's Messages API — single-turn, no tools, no streaming needed for this feature.
- Pass the already-computed ledger rows (status, due date, building name, device identifier) as structured input; ask for a short, prioritized summary. Use a low temperature — this is a live demo, and reducing (not eliminating) output variance matters more here than creative phrasing.
- `ANTHROPIC_API_KEY` via env var (`backend/.env.example`/`.env` — added Wed 7/22 per the day-by-day plan).
- Wrap the Claude call in a try/except with a timeout; any failure returns the `narration_unavailable` shape rather than a 500.

## 6. Sequencing cross-reference

| Contract | Day | Owner(s) |
| --- | --- | --- |
| Elevator edit (already exists — verify only) | Tue 7/21 (tonight) | Cornell (verify), Andres (wire UI) |
| Ledger `?building=` filter | Wed 7/22 | Cornell (backend), Andres (UI) |
| AI narration (`/api/ledger/narration/`) | Sun 7/26 | Cornell (backend), Karl (TS type + client), Andres (panel), Schiffon (styling) |
| Address lookup (`/api/buildings/lookup/`) | Mon–Tue 7/27–28 | Cornell (backend + geocoding risk), Karl (TS type + client), Andres (form + wiring), Schiffon (review-screen styling) |

## 7. Open verification items

- **Geocoding service reachability + auth** (§4, Stage 1) — must resolve by Monday 7/27, owned by Cornell, flagged in the PRD's Open Questions too.
- **NYC Open Data app token** — optional, anonymous access likely sufficient at demo scale; confirm no rate-limit issues surface during rehearsal.
- **`ANTHROPIC_API_KEY` provisioning** — who actually holds/generates this key, needed by Wed 7/22 per the env-prep task.
