# Geocoding reachability — findings & resolution

**Owner:** Cornell Robertson · **Status:** Resolved · **Verified:** 2026-07-22 (live checks)

Resolves the flagged risk in PRD rev 2 ("Is NYC Planning's GeoSearch API actually
reachable, or has it been retired?") and the ambiguous-match open question, both
owned by Cornell and due before Monday 2026-07-27 integration work.

## TL;DR

The HTTP 410 was a **stale API version**, not a dead service. **GeoSearch v2 is
live, keyless, and returns the BIN directly.** The address → BIN → DOB-devices
chain works end-to-end with no auth on either hop. **No blocker for Monday; the
key-required Geoservice fallback is unnecessary.**

## What was checked (live)

| Hop | Endpoint | Result |
| --- | --- | --- |
| Geocode v1 (assumed) | `https://geosearch.planninglabs.nyc/v1/search` | **410 Gone** — retired |
| Geocode v2 | `https://geosearch.planninglabs.nyc/v2/search` | **200**, no auth; BIN at `features[].properties.addendum.pad.bin` |
| DOB devices | `https://data.cityofnewyork.us/resource/e5aq-a4j2.json?bin=<BIN>` | **200**, no auth |

End-to-end proof: `120 Broadway` → v2 → **BIN 1001026** → `e5aq-a4j2` → 3 live
`Elevator` devices (e.g. `1P766`, `Active`, `cat1_latest_report_filed=2026-02-04`,
`cat5_latest_report_filed=2024-01-15`). The DOB field names match the PRD's
assumptions exactly (`cat1_latest_report_filed`, `cat5_latest_report_filed`,
`device_status`, `bin`, `house_number`, `street_name`).

## Decisions

1. **Use GeoSearch v2, keyless.** Point the resolver at the v2 `/search` endpoint;
   read the BIN from `addendum.pad.bin`. Drop the "register for a Geoservice key"
   fallback — not needed.
2. **Disambiguate; never first-match.** A vague address is genuinely ambiguous —
   `"200 Water St"` returned 5 matches across **Manhattan and Brooklyn** (distinct
   BINs). Rule: request `size=5`; if the matches resolve to a single distinct BIN,
   auto-select; if more than one, show a disambiguation picker (label + borough).
   `apps.compliance.dob.is_ambiguous()` implements this test.
3. **Manual entry stays first-class** (unchanged from PRD): if an address doesn't
   resolve, or the BIN returns no devices, fall back to the manual add flow.

## Still open (not blocking Monday)

- **App token (Karl):** anonymous Socrata access returned 200 at demo scale — a
  token is optional, only for rate limits.
- **Device→Elevator mapping (team):** a DOB device carries *both* a CAT1 and a
  CAT5 date, while `Elevator` has one `inspection_type` + one `last_inspection_date`.
  One device may need to become up to two `Elevator` rows. This is a contract
  decision for `integration-contracts.md` before the resolver is wired into a DRF
  endpoint. Flagged as a `TODO(team)` in `apps/compliance/dob.py`.

## Reference implementation

`apps/compliance/dob.py` — `resolve_address()`, `is_ambiguous()`, `fetch_devices()`,
covered by `tests/test_dob.py` (network mocked; payload fixtures captured from the
live responses above). This is a POC of the lookup spine, not a wired endpoint.
