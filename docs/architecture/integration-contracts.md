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

Request — initial lookup by address:

```json
{ "address": "350 Fifth Avenue, Manhattan" }
```

Request — re-call after the user disambiguates via the picker (skips geocoding entirely, goes straight to the Stage 2 device fetch for that BIN):

```json
{ "bin": "1001686" }
```

Exactly one of `address`/`bin` must be present in a request; the client sends `bin` only when re-calling after resolving an `"ambiguous_match"` response, and never sends both.

**On a `bin`-only request, `match.resolved_address`/`match.borough` come back `null`** — that path skips geocoding entirely (per the request note above), so the backend has no `AddressMatch` label/borough to echo back, only the BIN it was given. The client already has the real `resolved_address`/`borough` for the chosen candidate from the `matches` array of the prior `"ambiguous_match"` response — use that instead of trusting these fields when they're null, rather than displaying/saving a null address.

Response — match found:

```json
{
  "match": {
    "bin": "1001686",
    "resolved_address": "350 5 AVENUE",
    "borough": "MANHATTAN"
  },
  "matches": null,
  "drafts": [
    {
      "dob_device_number": "...",
      "device_status": "...",
      "inspection_type": "CAT1",
      "last_inspection_date": "2026-03-01"
    }
  ],
  "reason": null
}
```

Response — address resolved but DOB has no devices on file:

```json
{
  "match": { "bin": "...", "resolved_address": "...", "borough": "..." },
  "matches": null,
  "drafts": [],
  "reason": "no_devices_on_file"
}
```

Response — address didn't resolve to a BIN at all:

```json
{ "match": null, "matches": null, "drafts": [], "reason": "address_not_found" }
```

Response — upstream service (geocoder or Socrata) unavailable:

```json
{
  "match": null,
  "matches": null,
  "drafts": [],
  "reason": "upstream_unavailable"
}
```

Response — address resolved to more than one distinct BIN (ambiguous — e.g. `"200 Water St"` spans Manhattan and Brooklyn); the frontend must show a disambiguation picker built from `matches` and never silently take the first entry, then re-call this endpoint with the chosen candidate's `bin`:

```json
{
  "match": null,
  "matches": [
    {
      "bin": "1001686",
      "resolved_address": "200 WATER STREET",
      "borough": "MANHATTAN"
    },
    {
      "bin": "3001234",
      "resolved_address": "200 WATER STREET",
      "borough": "BROOKLYN"
    }
  ],
  "drafts": [],
  "reason": "ambiguous_match"
}
```

**Design choice:** always return HTTP 200 with a `reason` field rather than 4xx/5xx for the "no match"/"no devices"/"ambiguous match" cases — these are expected, user-facing outcomes the frontend needs to branch on gracefully (fall back to manual entry, or show the picker), not exceptional errors. Reserve a non-200 status for genuinely unexpected failures (malformed request body, etc.).

`matches` is populated only when `reason` is `"ambiguous_match"`; it is `null` in every other case. It carries one entry per `AddressMatch` candidate returned by `resolve_address` (`backend/apps/compliance/dob.py`), using each candidate's `label` as `resolved_address` and `borough` as-is.

**This endpoint is read-only/preview — it does not persist anything.** The frontend takes the response, lets the user review/override each draft in the list, then calls the _existing_ `POST /api/buildings/` + `POST /api/elevators/` endpoints to actually save — same validation, same code path, same tests as manual entry. This avoids needing a bulk-create endpoint and keeps the write path identical regardless of how the data originated.

`drafts` is the response's device data, already shaped one-elevator-row-per-draft to match `CreateElevatorPayload` directly (see §4 Stage 3) — **not** raw DOB device rows. A single physical device with both a CAT1 and a CAT5 filing date yields two entries in `drafts`, one per inspection type, both carrying the same `dob_device_number`. This is deliberate: the frontend's review/override screen (PRD Journey 1 P1) renders and edits one elevator per row, and drafts are directly postable to `POST /api/elevators/` once the user assigns/creates the building. Note also that `periodic_latest_inspection` — present in an earlier stale draft of this doc — is dropped from the contract entirely: it's not implemented anywhere in `dob.py`'s `DobDevice`/`fetch_devices` and is out of scope for this feature.

TS types to add in `domain.ts`:

```ts
export interface AddressLookupRequest {
  address?: string;
  bin?: string;
}

export interface ElevatorDraft {
  dob_device_number: string;
  device_status: string;
  inspection_type: "CAT1" | "CAT5";
  last_inspection_date: string;
}

export interface AddressLookupResponse {
  match: { bin: string; resolved_address: string; borough: string } | null;
  matches: { bin: string; resolved_address: string; borough: string }[] | null;
  drafts: ElevatorDraft[];
  reason:
    | "address_not_found"
    | "no_devices_on_file"
    | "upstream_unavailable"
    | "ambiguous_match"
    | null;
}
```

Client: `lookupBuildingByAddress(request: AddressLookupRequest): Promise<AddressLookupResponse>` — note the existing POC signature (`lookupBuildingByAddress(address: string)` in `frontend/src/api/client.ts`) predates the `bin`-based disambiguation re-call and needs updating to accept the full request shape; that update is frontend follow-up work, not part of this contract doc.

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

### Stage 1 — address → BIN (✅ implemented, `backend/apps/compliance/dob.py`)

The PRD assumed NYC Planning's **GeoSearch API** — documented as free, keyless, Pelias-based. A live check during the 2026-07-21 revision hit **HTTP 410 Gone** on `/v1/search`. **Resolved 2026-07-22**: `/v2/search` is the live, keyless replacement and returns the BIN directly at `properties.addendum.pad.bin`. Full findings: `docs/architecture/geocoding-reachability-findings.md`.

Implemented as `resolve_address(address: str, *, size: int = 5) -> list[AddressMatch]`, returning ranked candidates (each with `label`/`borough`/`bin`) rather than a single best guess, plus `is_ambiguous(matches: list[AddressMatch]) -> bool` — **disambiguate, never first-match**: a lookup spanning more than one distinct BIN (e.g. `"200 Water St"` matches across both Manhattan and Brooklyn) must present a picker rather than silently onboarding the first result.

### Stage 2 — BIN → DOB devices (✅ implemented, `backend/apps/compliance/dob.py`)

`GET https://data.cityofnewyork.us/resource/e5aq-a4j2.json?bin=<bin>` — NYC Open Data Socrata SODA API, **no authentication required**, confirmed reachable. Implemented as `fetch_devices(bin_value: str, *, limit: int = 1000) -> list[DobDevice]`, normalizing `device_number`/`device_type`/`device_status`/`cat1_latest_report_filed`/`cat5_latest_report_filed`/`house_number`/`street_name`/`bin` off each row.

Open item (non-blocking): whether to provision a Socrata app token for higher rate limits, or rely on anonymous access — fine at demo scale either way, confirmed during Cornell's research.

### Stage 3 — mapping to elevator drafts (pure function, no I/O) — device→Elevator decision resolved 2026-07-24

`dob.py` deliberately stopped short of this mapping (flagged `TODO(team)`): a `DobDevice` can carry **both** a CAT1 and a CAT5 filing date, whereas `Elevator` has one `inspection_type` + one `last_inspection_date` per row.

**Decision:** `map_dob_devices_to_drafts` emits **one `ElevatorDraft` per populated date field** — a device with both `cat1_latest_report_filed` and `cat5_latest_report_filed` set yields two draft rows (one `CAT1`, one `CAT5`), each carrying the same `dob_device_number` back to its source device. A device with only one date populated yields one row. This keeps the existing one-type-per-`Elevator`-row model intact rather than widening it.

```python
def map_dob_devices_to_drafts(devices: list[DobDevice]) -> list[ElevatorDraft]:
    """One ElevatorDraft per populated cat1/cat5 date on each device;
    inspection_type inferred from which field was populated, device_number
    carried through as dob_device_number."""
```

Where this lives: alongside `resolve_address`/`fetch_devices` in `backend/apps/compliance/dob.py` (flat module, not a package — matches what Cornell already built). The `/api/buildings/lookup/` view composes stages 1→2→3; still Monday 7/27's work (the POC deliberately doesn't wire a DRF endpoint yet).

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

- New module `backend/apps/compliance/narration.py` (flat, matching `dob.py` — **not** `services/narration.py`; `apps/compliance/services.py` is already a flat file imported elsewhere, so nesting under a `services/` package would break those imports): `generate_narration(entries: list[LedgerEntry]) -> str`, using the `anthropic` Python SDK's Messages API — single-turn, no tools, no streaming needed for this feature. Matches the module path already assumed by PR #77's pre-written tests (`from apps.compliance import narration`).
- Pass the already-computed ledger rows (status, due date, building name, device identifier) as structured input; ask for a short, prioritized summary. Use a low temperature — this is a live demo, and reducing (not eliminating) output variance matters more here than creative phrasing.
- `ANTHROPIC_API_KEY` via env var (`backend/.env.example`/`.env` — added Wed 7/22 per the day-by-day plan).
- Wrap the Claude call in a try/except with a timeout; any failure returns the `narration_unavailable` shape rather than a 500.

## 6. New contract: fine/penalty exposure (issue #120)

Two additions, both read-only:

**`GET /api/ledger/`** rows now carry `has_open_violation: boolean` — resolved by joining each row's `dob_device_number` against the DOB Safety Violations feed (`855j-jady`, Socrata), batched once per request rather than per row (`backend/apps/compliance/violations.py::fetch_open_device_numbers`). An elevator with no `dob_device_number` is always `false`. `GET /api/ledger/narration/` uses the same batched flag on its input entries, and the narration system prompt (`narration.py::_SYSTEM_PROMPT`) now instructs Claude to call out elevators with an open violation explicitly.

**`GET /api/buildings/fine-exposure/`** — new, portfolio-wide, always fetched once on load (alongside `listBuildings()`/`listLedger()`, not on a per-building click). Returns one row per building, resolved via a **single batched** Socrata call across every building's BIN (`violations.py::fetch_building_fine_exposures`) rather than one request per building — this was revised 2026-07-28 from an earlier on-demand-per-building design once batching turned out to be just as cheap as the `has_open_violation` join above; see this file's git history for the superseded per-building shape if it's ever useful as a reference.

```json
[
  {
    "building": 20,
    "bin": "1036156",
    "total_exposure": "0",
    "open_violation_count": 0,
    "reason": null
  },
  {
    "building": 19,
    "bin": null,
    "total_exposure": null,
    "open_violation_count": null,
    "reason": "no_bin_on_file"
  }
]
```

`reason` is per-row: `"no_bin_on_file"` (that building was never DOB-matched — no BIN to query by) or `"upstream_unavailable"` (the batched Socrata call failed — every building that _does_ have a BIN gets this reason together; a no-BIN building keeps `"no_bin_on_file"` regardless, since there was never a lookup to fail for it). Both are still HTTP 200, mirroring `POST /api/buildings/lookup/`'s contract in §3. `total_exposure` is a decimal **string**, not a number — avoids float precision loss on a dollar amount; parse client-side only for display, never for further arithmetic.

**Why building-level, not per-elevator dollars**: the ECB feed only joins by BIN, not by device number, so an exact per-elevator dollar figure isn't reliably attributable when a building has more than one elevator with concurrent violations. See the issue's "join-key gap" writeup for the full reasoning — this was a deliberate product call, not an oversight.

**AI narration also gets this data**: `GET /api/ledger/narration/` additionally batches fine exposure for every building represented in the ledger (`views.py::_fetch_building_fine_exposures_for_narration`) and passes it to `narration.generate_narration()` as a second argument, `building_fine_exposures` — a list of `{building_name, total_exposure, open_violation_count}` for buildings that have a BIN (buildings without one are omitted, not reported as zero). The system prompt instructs Claude to cite the actual dollar figure for a building when one is present, and never to invent one for a building outside that list.

TS types: `LedgerEntry.has_open_violation`, `BuildingFineExposure` (both in `frontend/src/types/domain.ts`). Client: `fetchPortfolioFineExposure(): Promise<BuildingFineExposure[]>`, called once by `App` on mount/`reloadSignal` alongside `listBuildings()`/`listLedger()`.

## 7. Sequencing cross-reference

| Contract | Day | Owner(s) |
| --- | --- | --- |
| Elevator edit (already exists — verify only) | Tue 7/21 (tonight) | Cornell (verify), Andres (wire UI) |
| Ledger `?building=` filter | Wed 7/22 | Cornell (backend), Andres (UI) |
| AI narration (`/api/ledger/narration/`) | Sun 7/26 | Cornell (backend), Karl (TS type + client), Andres (panel), Schiffon (styling) |
| Address lookup (`/api/buildings/lookup/`) | Mon–Tue 7/27–28 | Cornell (backend + geocoding risk), Karl (TS type + client), Andres (form + wiring), Schiffon (review-screen styling) |
| Fine/penalty exposure (`has_open_violation`, `/api/buildings/fine-exposure/`, narration wiring) | Tue 7/28 | Karl (backend + TS type + client, fallback trigger — see issue #120) |

## 8. Open verification items

- ~~**Geocoding service reachability + auth** (§4, Stage 1)~~ — **resolved 2026-07-22** by Cornell: GeoSearch v2, keyless. See `docs/architecture/geocoding-reachability-findings.md`.
- **NYC Open Data app token** — optional, anonymous access likely sufficient at demo scale; confirm no rate-limit issues surface during rehearsal. `violations.py` (§6) hits two more Socrata resources anonymously, same as `dob.py`'s existing pattern — an app token is available if rate-limiting shows up (offered 2026-07-28), but hasn't been needed yet.
- **`ANTHROPIC_API_KEY` provisioning** — who actually holds/generates this key, needed by Wed 7/22 per the env-prep task.
- **§103-02 statutory penalty amounts** (issue #120) — the flat-fee/monthly-late-fee figures cited in the issue are from secondary sources, not yet verified against the primary NYC rule text. Not load-bearing for the shipped feature (which surfaces real recorded violations from the ECB feed, not computed statutory estimates), but worth closing out before those figures are ever hardcoded/displayed anywhere.
