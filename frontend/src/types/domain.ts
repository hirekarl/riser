/**
 * Domain types mirroring the backend contract (Django REST Framework serializers).
 * Kept in sync manually with the backend team until an integration agent automates it.
 */

export type InspectionType = "CAT1" | "CAT5";

/**
 * Matches the exact strings returned by the backend's `Status` enum
 * (`apps.compliance.services.Status`) — capitalized, human-readable, and
 * usable directly as display text. Do not lowercase or reinterpret this at
 * the client boundary; it's the API's source-of-truth vocabulary.
 */
export type ComplianceStatus = "Compliant" | "Warning" | "Delinquent";

export interface Building {
  id: number;
  name: string;
  address: string;
  created_at: string;
  updated_at: string;
}

export interface Elevator {
  id: number;
  building: number;
  device_identifier: string;
  inspection_type: InspectionType;
  last_inspection_date: string;
  created_at: string;
  updated_at: string;
}

/**
 * A single row in the portfolio-wide ledger, as returned by GET /api/ledger/.
 * The API pre-sorts these: delinquent > warning > compliant, then by due_date ascending.
 * Clients must trust this order and render it as-is, not re-sort client-side.
 *
 * This mirrors `LedgerEntrySerializer`'s field list exactly — it does NOT
 * extend `Elevator`: the ledger endpoint deliberately omits `building` (the
 * FK id, replaced by `building_name`), `created_at`, and `updated_at`.
 */
export interface LedgerEntry {
  id: number;
  device_identifier: string;
  inspection_type: InspectionType;
  last_inspection_date: string;
  building_name: string;
  due_date: string;
  status: ComplianceStatus;
}

export interface CreateBuildingPayload {
  name: string;
  address: string;
}

export interface CreateElevatorPayload {
  building: number;
  device_identifier: string;
  inspection_type: InspectionType;
  last_inspection_date: string;
}

export type UpdateElevatorPayload = Partial<
  Pick<Elevator, "device_identifier" | "inspection_type" | "last_inspection_date">
>;

/**
 * Shape of GET /api/ledger/narration/ (not yet implemented backend-side —
 * scheduled Sun 2026-07-26 per docs/sprints/day-by-day-plan.md). Added ahead
 * of the endpoint per docs/architecture/integration-contracts.md §5, which
 * is the pre-agreed source of truth for this shape.
 */
export interface NarrationResponse {
  narration: string;
  generated_at: string;
}

/** 503 response shape when the Claude API call fails or times out. */
export interface NarrationErrorResponse {
  error: "narration_unavailable";
}

/**
 * Shapes for POST /api/buildings/lookup/ (not yet implemented backend-side —
 * scheduled Mon 2026-07-27). Added ahead of the endpoint per
 * docs/architecture/integration-contracts.md §3.
 *
 * Exactly one of `address`/`bin` is present per request: `address` for the
 * initial lookup, `bin` when the client re-calls after the user disambiguates
 * via the picker shown for an `"ambiguous_match"` response (skips geocoding,
 * goes straight to the DOB device fetch for that BIN).
 */
export interface AddressLookupRequest {
  address?: string;
  bin?: string;
}

/**
 * One elevator row derived from a DOB device's populated CAT1/CAT5 filing
 * date — shaped to match `CreateElevatorPayload` so it's directly postable
 * to POST /api/elevators/ once the user reviews/overrides it. A single DOB
 * device with both dates populated yields two drafts (one CAT1, one CAT5)
 * sharing the same `dob_device_number`. See integration-contracts.md §4
 * Stage 3 (`map_dob_devices_to_drafts`).
 */
export interface ElevatorDraft {
  dob_device_number: string;
  device_status: string;
  inspection_type: InspectionType;
  last_inspection_date: string;
}

/**
 * Shape of POST /api/demo-data/seed/ (201 on success). Always additive —
 * never destructive/replacing — per ADR-0002 (no-auth MVP). Both counts
 * reflect what this specific call created, not portfolio-wide totals.
 */
export interface SeedDemoDataResponse {
  buildings_created: number;
  elevators_created: number;
}

export interface AddressLookupResponse {
  /**
   * `resolved_address`/`borough` are `null` when this came from a bin-only
   * re-call (post-disambiguation) — the backend skips geocoding on that path
   * and has no label/borough to echo back. Callers that already know the
   * picked candidate's label/borough (from the `matches` picker) should
   * prefer that over trusting these fields in that case.
   */
  match: { bin: string; resolved_address: string | null; borough: string | null } | null;
  /**
   * Populated only when `reason` is `"ambiguous_match"` (otherwise `null`) —
   * one entry per candidate BIN the address resolved to. The frontend must
   * render these as a disambiguation picker and never silently take the
   * first entry; re-call this endpoint with the chosen candidate's `bin`.
   */
  matches: { bin: string; resolved_address: string; borough: string }[] | null;
  drafts: ElevatorDraft[];
  reason:
    "address_not_found" | "no_devices_on_file" | "upstream_unavailable" | "ambiguous_match" | null;
}
