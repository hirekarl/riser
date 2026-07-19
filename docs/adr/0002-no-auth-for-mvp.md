# 2. No authentication for the MVP

## Status

Proposed — confirm with the team before the Sprint 01 demo.

## Context

`docs/prd/Riser-PRD.md` section 3 (User Journeys, P0–P2 requirements) does not describe a login, signup, or session-management journey anywhere. The PRD's "Users & Needs" section distinguishes a primary user (property manager) from a secondary, view-only user (building owner), but no requirement ties that distinction to an authentication or authorization mechanism, and the Non-Goals section is silent on auth as well.

## Decision

Absent an explicit requirement, the MVP is being built **single-tenant and without authentication** — anyone with the deployed URL sees and can edit the full portfolio ledger. This keeps Sprint 01 focused on the PRD's actual P0: the deterministic compliance-risk triage pipeline.

## Consequences

- No `User` model, login views, session/token auth, or permission classes are in scope for Sprint 01.
- The distinction between "property manager" (read/write) and "building owner" (read-only) described in the PRD is **not enforced** anywhere in the MVP — both would currently get the same full-access view.
- This must be explicitly confirmed by the team (see PRD "Open Questions"). If the team decides auth is actually needed before the demo, this ADR should be superseded by a new one describing the chosen approach, and the read/write vs. read-only distinction should become a real P0/P1 requirement rather than an implicit assumption.
