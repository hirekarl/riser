import { Fragment, useEffect, useId, useRef, useState } from "react";
import { deleteElevator, updateElevator } from "../../api/client";
import { EmptyState } from "../../components/EmptyState";
import { Spinner } from "../../components/Spinner";
import { StatusBadge } from "../../components/StatusBadge";
import { getDueUrgency } from "../../lib/dueUrgency";
import { logError } from "../../lib/logger";
import type { Building, ComplianceStatus, LedgerEntry } from "../../types/domain";
import { ElevatorDetailDrawer } from "./ElevatorDetailDrawer";
import styles from "./LedgerPage.module.css";

// Matches the sweep-fade animation duration in LedgerPage.module.css, plus a
// small margin, so the highlight class clears after the animation (or, under
// prefers-reduced-motion, the static background) has had time to be seen.
const HIGHLIGHT_DURATION_MS = 1800;

// Same urgency order the ledger endpoint itself sorts by (see LedgerEntry in
// types/domain.ts) — the status filter's options follow that order rather
// than, say, alphabetical, so the dropdown reads consistently with the table.
const STATUS_FILTER_OPTIONS: ComplianceStatus[] = ["Delinquent", "Warning", "Compliant"];

type SortColumn =
  | "status"
  | "building_name"
  | "device_identifier"
  | "inspection_type"
  | "last_inspection_date"
  | "due_date";

type SortDirection = "ascending" | "descending";

interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

const SORTABLE_COLUMNS: { column: SortColumn; label: string }[] = [
  { column: "status", label: "Status" },
  { column: "building_name", label: "Building" },
  { column: "device_identifier", label: "Device" },
  { column: "inspection_type", label: "Inspection type" },
  { column: "last_inspection_date", label: "Last inspection date" },
  { column: "due_date", label: "Due date" },
];

// Total column count of the table (the sortable columns above plus the
// trailing, non-sortable Actions column) — used both for the header row and
// for the colSpan of any full-width row (the expanded remediation panel, the
// group-by-building section header).
const COLUMN_COUNT = SORTABLE_COLUMNS.length + 1;

// Status sorts by urgency rank (via STATUS_FILTER_OPTIONS' Delinquent > Warning
// > Compliant order), not alphabetically; last_inspection_date/due_date are
// plain YYYY-MM-DD strings, so lexicographic comparison is already
// chronological — no Date parsing needed. Everything else is a plain string.
function sortValue(entry: LedgerEntry, column: SortColumn): string | number {
  if (column === "status") return STATUS_FILTER_OPTIONS.indexOf(entry.status);
  return entry[column];
}

function compareEntries(a: LedgerEntry, b: LedgerEntry, sort: SortState): number {
  const va = sortValue(a, sort.column);
  const vb = sortValue(b, sort.column);
  const cmp = va < vb ? -1 : va > vb ? 1 : 0;
  return sort.direction === "ascending" ? cmp : -cmp;
}

// Plain-language remediation copy for a Warning/Delinquent row, derived
// entirely from data the ledger already returns (status, due_date,
// inspection_type) — no new endpoint. Compliant rows don't get this panel;
// there's nothing to remediate. Where-to-go is intentionally generic (DOB's
// elevator unit / a licensed inspection agency), not a live lookup.
function getRemediationCopy(entry: LedgerEntry): {
  whatsWrong: string;
  nextStep: string;
  whereToGo: string;
  openViolationNote: string | null;
} {
  // Sources its day-count math from the same shared helper the due-date
  // column's urgency styling uses (frontend/src/lib/dueUrgency.ts), so the
  // two never drift out of sync on the UTC-midnight-normalization convention
  // backend/apps/compliance/services.py uses for this math server-side.
  const { dayDiff } = getDueUrgency(entry);

  const whatsWrong =
    entry.status === "Delinquent"
      ? `${entry.inspection_type} filing is ${Math.abs(dayDiff)} day${Math.abs(dayDiff) === 1 ? "" : "s"} overdue — was due ${entry.due_date}.`
      : `${entry.inspection_type} filing is due soon — due ${entry.due_date}${dayDiff >= 0 ? ` (${dayDiff} day${dayDiff === 1 ? "" : "s"} from now)` : ""}.`;

  const nextStep =
    entry.status === "Delinquent"
      ? "File the required inspection report as soon as possible — late fees accrue monthly until it's filed."
      : "Schedule the inspection now so the filing lands before the due date.";

  const whereToGo =
    "Contact your building's licensed elevator inspection agency to schedule or confirm filing, or NYC DOB's elevator unit (311) for questions about a specific violation.";

  // has_open_violation (issue #120) is a device-level flag only — no dollar
  // figure attached to it, since the DOB ECB Violations feed only joins by
  // BIN, not by device number (see docs/architecture/integration-contracts.md
  // §6). The building-level dollar total lives in the separate, on-demand
  // fine-exposure widget, not here.
  const openViolationNote = entry.has_open_violation
    ? "This elevator has an open DOB safety violation on file, in addition to its compliance status above."
    : null;

  return { whatsWrong, nextStep, whereToGo, openViolationNote };
}

export interface LedgerPageProps {
  /**
   * Ledger entries fetched once by the parent (`App`) via `listLedger()` and
   * shared with `TimelinePage`, so the two views don't each issue their own
   * request. `null` while the parent's initial fetch is still in flight.
   */
  entries: LedgerEntry[] | null;
  /**
   * Ledger-fetch error surfaced by the parent, if the shared `listLedger()`
   * call failed. Distinct from the inline-Save error this component still
   * tracks locally.
   */
  error?: string | null;
  /**
   * Buildings available to filter the ledger by. The building chip row and
   * the group-by-building toggle only render when there's more than one
   * (filtering/grouping by a single building has no effect).
   */
  buildings?: Building[];
  /**
   * Called with the full ledger entry for a row when its Edit button is
   * clicked, so a parent (e.g. `App`) can switch `ElevatorForm` into edit
   * mode for that elevator.
   */
  onEditRequest?: (entry: LedgerEntry) => void;
  /**
   * The id of the elevator currently open in the (parent-owned) Edit form, if
   * any. The row matching this id has its inline date input disabled and is
   * marked with `styles.editingRow`, so the same field can't be edited via
   * two surfaces at once (see the stale-overwrite race this prevents).
   */
  editingElevatorId?: number;
  /**
   * Called after an inline Save successfully persists a new
   * `last_inspection_date`, so the parent can refetch the ledger — status,
   * due_date, and rank are always server-computed, never recalculated here.
   */
  onElevatorUpdated?: () => void;
  /**
   * Passed straight through to the empty state's "Try sample data" button
   * (see `EmptyState`'s `onSeeded` prop) so the parent can trigger the same
   * ledger refetch it does after any other create/update. Optional (with a
   * no-op default) purely so existing tests that never render the empty
   * state don't need to pass it.
   */
  onSeeded?: () => void;
}

export function LedgerPage({
  entries,
  error = null,
  buildings = [],
  onEditRequest,
  editingElevatorId,
  onElevatorUpdated,
  onSeeded = () => {},
}: LedgerPageProps) {
  const statusFilterId = useId();
  const searchId = useId();
  const groupToggleId = useId();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | undefined>(undefined);
  const [selectedStatus, setSelectedStatus] = useState<ComplianceStatus | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupByBuilding, setGroupByBuilding] = useState(false);
  const [detailDrawerEntry, setDetailDrawerEntry] = useState<LedgerEntry | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [justChangedIds, setJustChangedIds] = useState<Set<number>>(new Set());
  const [sort, setSort] = useState<SortState | null>(null);

  // Tracks status changes across successive `entries` props (e.g. after an
  // inline Save triggers a parent refetch) to briefly highlight the row(s)
  // whose status just changed. Computed directly in the render body — React's
  // documented "adjust state based on a prop change" pattern
  // (https://react.dev/learn/you-might-not-need-an-effect) — rather than in a
  // useEffect, since this only ever needs to react to the `entries` prop
  // itself changing, not synchronize with anything external.
  const [previousEntries, setPreviousEntries] = useState(entries);
  if (entries !== previousEntries) {
    if (entries !== null && previousEntries !== null) {
      const previousStatuses = new Map(previousEntries.map((entry) => [entry.id, entry.status]));
      const changed = new Set<number>();
      for (const entry of entries) {
        const previousStatus = previousStatuses.get(entry.id);
        if (previousStatus !== undefined && previousStatus !== entry.status) {
          changed.add(entry.id);
        }
      }
      if (changed.size > 0) {
        setJustChangedIds(changed);
      }
    }
    setPreviousEntries(entries);
  }

  // Clearing the highlight after a delay is a genuine side effect (a timer,
  // an external API), so it stays in a useEffect — this only ever calls
  // setState from the timeout callback, never synchronously in the effect
  // body itself.
  useEffect(() => {
    if (justChangedIds.size === 0) return;
    const timeoutId = window.setTimeout(() => {
      setJustChangedIds(new Set());
    }, HIGHLIGHT_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [justChangedIds]);

  // Per-row pending edits for the inline date input: typing/selecting a new
  // date only updates this local state (keyed by elevator id) until the user
  // explicitly clicks Save. This avoids the previous auto-save-on-`onChange`
  // behavior, which risked an accidental unconfirmed edit.
  const [pendingDates, setPendingDates] = useState<Record<number, string>>({});

  // Inline reveal-confirm state for the per-row Delete action, mirroring the
  // date-input Save/Cancel pattern above: clicking Delete only reveals a
  // Confirm delete/Cancel pair for that one row (`confirmingDeleteId`); the
  // actual deleteElevator() call only ever happens from Confirm delete.
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // A deleted row's Delete/Confirm/Cancel buttons disappear the moment the
  // delete succeeds (immediately when confirmingDeleteId is cleared below,
  // and again shortly after when the parent's refetched `entries` drops the
  // row entirely) — whichever button had focus at that point would otherwise
  // be silently removed from the DOM, dropping keyboard/screen-reader focus
  // to <body> with no context. `captionRef` gives delete a stable, always-
  // present focus target to land on instead; `deleteAnnouncement` gives
  // screen-reader users an explicit confirmation of what was deleted, since
  // the row itself vanishing isn't otherwise announced.
  const captionRef = useRef<HTMLTableCaptionElement>(null);
  const [deleteAnnouncement, setDeleteAnnouncement] = useState<string | null>(null);

  function handleDeleteRequest(elevatorId: number) {
    setConfirmingDeleteId(elevatorId);
  }

  function handleDeleteCancel() {
    setConfirmingDeleteId(null);
  }

  async function handleDeleteConfirm(elevatorId: number) {
    setDeletingId(elevatorId);
    try {
      const deletedEntry = entries?.find((entry) => entry.id === elevatorId);
      await deleteElevator(elevatorId);
      setConfirmingDeleteId(null);
      captionRef.current?.focus();
      setDeleteAnnouncement(
        deletedEntry ? `${deletedEntry.device_identifier} deleted.` : "Elevator deleted.",
      );
      onElevatorUpdated?.();
    } catch (err) {
      logError("Failed to delete elevator", err, { elevatorId });
      setSaveError("Could not delete the elevator. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  function handleDateInputChange(elevatorId: number, newDate: string) {
    if (!newDate) return;
    setPendingDates((current) => ({ ...current, [elevatorId]: newDate }));
  }

  function handleToggleDetails(elevatorId: number) {
    setExpandedId((current) => (current === elevatorId ? null : elevatorId));
  }

  // 3-state cycle per column: no/different sort -> ascending -> descending ->
  // null (back to default order). Clicking a different column always resets
  // to ascending on that new column rather than continuing the old cycle.
  function handleSortClick(column: SortColumn) {
    setSort((current) => {
      if (!current || current.column !== column) return { column, direction: "ascending" };
      if (current.direction === "ascending") return { column, direction: "descending" };
      return null;
    });
  }

  function handleDateCancel(elevatorId: number) {
    setPendingDates((current) => {
      const next = { ...current };
      delete next[elevatorId];
      return next;
    });
  }

  async function handleDateSave(elevatorId: number) {
    const newDate = pendingDates[elevatorId];
    if (!newDate) return;
    setPendingId(elevatorId);
    try {
      await updateElevator(elevatorId, { last_inspection_date: newDate });
      setPendingDates((current) => {
        const next = { ...current };
        delete next[elevatorId];
        return next;
      });
      onElevatorUpdated?.();
    } catch (err) {
      logError("Failed to update elevator inspection date", err, { elevatorId });
      setSaveError("Could not update the inspection date. Please try again.");
    } finally {
      setPendingId(null);
    }
  }

  if (entries === null && !error) {
    return (
      <p role="status">
        <Spinner /> Loading portfolio ledger…
      </p>
    );
  }

  // LedgerEntry (see types/domain.ts) deliberately omits the building's
  // numeric id, exposing only `building_name` — so the filter matches by
  // name rather than id. All three filters below only ever narrow the
  // already server-sorted `entries` down to a subset (order preserved, AND'd
  // together); neither ever re-sorts them. The trailing `.sort()` is a
  // deliberate exception to that: it only runs when `sort` is non-null, i.e.
  // the user explicitly clicked a sortable column header, not an incidental
  // client-side re-sort.
  const selectedBuilding = buildings.find((building) => building.id === selectedBuildingId);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const visibleEntries =
    entries === null
      ? null
      : entries
          .filter((entry) => !selectedBuilding || entry.building_name === selectedBuilding.name)
          .filter((entry) => !selectedStatus || entry.status === selectedStatus)
          .filter(
            (entry) =>
              !normalizedSearch ||
              entry.building_name.toLowerCase().includes(normalizedSearch) ||
              entry.device_identifier.toLowerCase().includes(normalizedSearch) ||
              (entry.dob_device_number?.toLowerCase().includes(normalizedSearch) ?? false) ||
              entry.status.toLowerCase().includes(normalizedSearch),
          )
          .slice()
          .sort((a, b) => (sort ? compareEntries(a, b, sort) : 0));

  // "N devices across M buildings" always describes the full unfiltered
  // `entries` array (and the distinct building names within it), never the
  // post-filter/search `visibleEntries` — narrowing the visible rows via a
  // filter or search shouldn't make this header read as if data went
  // missing from the portfolio.
  const uniqueBuildingCount = entries
    ? new Set(entries.map((entry) => entry.building_name)).size
    : 0;

  // Groups preserve visibleEntries' existing status-urgency (and any active
  // column sort's) order within each building, and buildings are ordered by
  // first appearance in that same ordered list — so the most urgent
  // building's group still leads, matching the flat view's overall priority
  // ordering rather than falling back to something arbitrary like
  // alphabetical.
  const groupedEntries: { buildingName: string; entries: LedgerEntry[] }[] = [];
  if (visibleEntries) {
    const groupsByName = new Map<string, LedgerEntry[]>();
    for (const entry of visibleEntries) {
      const existing = groupsByName.get(entry.building_name);
      if (existing) {
        existing.push(entry);
      } else {
        groupsByName.set(entry.building_name, [entry]);
      }
    }
    for (const [buildingName, groupEntries] of groupsByName) {
      groupedEntries.push({ buildingName, entries: groupEntries });
    }
  }

  function renderEntryRow(entry: LedgerEntry) {
    const isEditingRow = editingElevatorId === entry.id;
    const rowClassName =
      [
        justChangedIds.has(entry.id) ? styles.highlighting : null,
        isEditingRow ? styles.editingRow : null,
      ]
        .filter(Boolean)
        .join(" ") || undefined;
    const pendingDate = pendingDates[entry.id];
    const hasPendingEdit = pendingDate !== undefined && pendingDate !== entry.last_inspection_date;
    const isSaving = pendingId === entry.id;
    const needsRemediation = entry.status === "Warning" || entry.status === "Delinquent";
    const isExpanded = expandedId === entry.id;
    const isConfirmingDelete = confirmingDeleteId === entry.id;
    const isDeleting = deletingId === entry.id;
    const urgency = getDueUrgency(entry);
    const dueDateClassName =
      urgency.level === "overdue"
        ? styles.dueOverdue
        : urgency.level === "soon"
          ? styles.dueSoon
          : styles.dueOk;

    return (
      <Fragment key={entry.id}>
        <tr className={rowClassName}>
          <td>
            <span className={styles.statusCell}>
              <StatusBadge status={entry.status} />
              {entry.has_open_violation && (
                <span className={styles.violationBadge}>
                  <span className={styles.violationIcon} aria-hidden="true">
                    ⚠
                  </span>{" "}
                  Open violation
                </span>
              )}
            </span>
          </td>
          <td>{entry.building_name}</td>
          <td>
            {entry.device_identifier}
            {entry.dob_device_number && (
              <span className={styles.dobDeviceNumber}>(DOB #{entry.dob_device_number})</span>
            )}
          </td>
          <td>{entry.inspection_type}</td>
          <td>
            <label>
              <span className="visually-hidden">
                Last inspection date for {entry.device_identifier}
              </span>
              <input
                type="date"
                className={styles.dateInput}
                value={pendingDate ?? entry.last_inspection_date}
                disabled={isSaving || isEditingRow}
                onChange={(event) => handleDateInputChange(entry.id, event.target.value)}
              />
            </label>
            {hasPendingEdit && (
              <span className={styles.dateActions}>
                <button
                  type="button"
                  className={styles.saveDateButton}
                  aria-label={`Save inspection date for ${entry.device_identifier}`}
                  disabled={isSaving}
                  onClick={() => handleDateSave(entry.id)}
                >
                  {isSaving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  className={styles.cancelDateButton}
                  aria-label={`Cancel editing inspection date for ${entry.device_identifier}`}
                  disabled={isSaving}
                  onClick={() => handleDateCancel(entry.id)}
                >
                  Cancel
                </button>
              </span>
            )}
          </td>
          <td>
            <span className={dueDateClassName}>{entry.due_date}</span>
            {urgency.subtext && <span className={styles.dueSubtext}>{urgency.subtext}</span>}
          </td>
          <td>
            {/* Two deliberate rows rather than letting four+ controls wrap
                wherever the browser happens to break the line: row 1 is the
                primary, equal-weight Edit/Delete pair (or Edit alongside the
                Confirm delete/Cancel pair once Delete is clicked); row 2 is
                the lower-priority, text-style Remediation steps/Device
                details links. Keeps action weight and alignment consistent
                regardless of which optional buttons are present on a given
                row. */}
            <div className={styles.actionsCell}>
              <div className={styles.actionsPrimary}>
                <button
                  type="button"
                  className={styles.editButton}
                  aria-label={`Edit ${entry.device_identifier}`}
                  onClick={() => onEditRequest?.(entry)}
                >
                  Edit
                </button>
                {isConfirmingDelete ? (
                  <span className={styles.deleteActions}>
                    <button
                      type="button"
                      className={styles.confirmDeleteButton}
                      aria-label={`Confirm delete ${entry.device_identifier}`}
                      disabled={isDeleting}
                      onClick={() => handleDeleteConfirm(entry.id)}
                    >
                      {isDeleting ? "Deleting…" : "Confirm delete"}
                    </button>
                    <button
                      type="button"
                      className={styles.cancelDeleteButton}
                      aria-label={`Cancel deleting ${entry.device_identifier}`}
                      disabled={isDeleting}
                      onClick={handleDeleteCancel}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className={styles.deleteButton}
                    aria-label={`Delete ${entry.device_identifier}`}
                    onClick={() => handleDeleteRequest(entry.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className={styles.actionsSecondary}>
                {needsRemediation && (
                  <button
                    type="button"
                    className={styles.detailsButton}
                    aria-label={`${isExpanded ? "Hide" : "Show"} remediation steps for ${entry.device_identifier}`}
                    aria-expanded={isExpanded}
                    onClick={() => handleToggleDetails(entry.id)}
                  >
                    {isExpanded ? "Hide remediation steps" : "Remediation steps"}
                  </button>
                )}
                {/* Distinct from "Remediation steps" above: that's
                    plain-language guidance on what to do next, this opens a
                    structured reference view (raw inspection/violation data +
                    the DOB BIS lookup link) — named "Device details" rather
                    than a "full"/"more" variant of the other label so the two
                    don't read as the same action at two depths. */}
                <button
                  type="button"
                  className={styles.detailLink}
                  aria-label={`View device details for ${entry.device_identifier}`}
                  onClick={() => setDetailDrawerEntry(entry)}
                >
                  Device details <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </td>
        </tr>
        {isExpanded && (
          <tr>
            <td colSpan={COLUMN_COUNT} className={styles.detailCell}>
              {(() => {
                const { whatsWrong, nextStep, whereToGo, openViolationNote } =
                  getRemediationCopy(entry);
                return (
                  <dl className={styles.detailPanel}>
                    <div>
                      <dt>What&apos;s wrong</dt>
                      <dd>{whatsWrong}</dd>
                    </div>
                    {openViolationNote && (
                      <div>
                        <dt>Open DOB safety violation</dt>
                        <dd>{openViolationNote}</dd>
                      </div>
                    )}
                    <div>
                      <dt>Next step</dt>
                      <dd>{nextStep}</dd>
                    </div>
                    <div>
                      <dt>Where to go</dt>
                      <dd>{whereToGo}</dd>
                    </div>
                  </dl>
                );
              })()}
            </td>
          </tr>
        )}
      </Fragment>
    );
  }

  return (
    <div className={styles.wrapper}>
      {/* Always-mounted polite live region (not conditionally rendered) so
          assistive tech has already registered it by the time a delete
          updates its text — see the comment on `deleteAnnouncement` above. */}
      <div role="status" aria-live="polite" className="visually-hidden">
        {deleteAnnouncement}
      </div>
      {error && (
        <div className={styles.errorBanner} role="alert">
          {error}
        </div>
      )}
      {saveError && (
        <div className={styles.errorBanner} role="alert">
          {saveError}
        </div>
      )}

      {/*
        Display copy only — the actual thresholds live in
        backend/apps/compliance/services.py (WARNING_WINDOW_DAYS, and the
        Delinquent/Warning/Compliant rules in calculate_status). There is no
        API-exposed value for this threshold, so if that constant ever
        changes, this text must be updated by hand to match.
      */}
      <details className={styles.legend}>
        <summary className={styles.legendSummary}>What do these statuses mean?</summary>
        <dl className={styles.legendList}>
          <div className={styles.legendItem}>
            <dt>
              <StatusBadge status="Compliant" />
            </dt>
            <dd>The next inspection is due more than 30 days from today.</dd>
          </div>
          <div className={styles.legendItem}>
            <dt>
              <StatusBadge status="Warning" />
            </dt>
            <dd>The next inspection is due today or within the next 30 days.</dd>
          </div>
          <div className={styles.legendItem}>
            <dt>
              <StatusBadge status="Delinquent" />
            </dt>
            <dd>The next inspection&apos;s due date has already passed.</dd>
          </div>
        </dl>
      </details>

      {/* The whole toolbar (title, count, group-by toggle, chip row, search
          box) renders together, gated on there being at least one entry —
          nothing here is useful over an empty ledger. */}
      {entries && entries.length > 0 && (
        <div className={styles.ledgerHead}>
          <div className={styles.ledgerTitleRow}>
            <h2 className={styles.ledgerTitle}>Portfolio Ledger</h2>
            <span className={styles.ledgerCount}>
              {entries.length} device{entries.length === 1 ? "" : "s"} across {uniqueBuildingCount}{" "}
              building{uniqueBuildingCount === 1 ? "" : "s"}
            </span>
          </div>
          {buildings.length > 1 && (
            <label className={styles.groupToggle} htmlFor={groupToggleId}>
              Group by building
              <input
                id={groupToggleId}
                type="checkbox"
                checked={groupByBuilding}
                onChange={(event) => setGroupByBuilding(event.target.checked)}
              />
              <span className={styles.switchTrack} aria-hidden="true"></span>
            </label>
          )}
        </div>
      )}

      {entries && entries.length > 0 && buildings.length > 1 && (
        <div className={styles.chipRow} role="group" aria-label="Filter by building">
          <button
            type="button"
            className={selectedBuildingId === undefined ? styles.chipActive : styles.chip}
            aria-pressed={selectedBuildingId === undefined}
            onClick={() => setSelectedBuildingId(undefined)}
          >
            All buildings
          </button>
          {buildings.map((building) => (
            <button
              key={building.id}
              type="button"
              className={selectedBuildingId === building.id ? styles.chipActive : styles.chip}
              aria-pressed={selectedBuildingId === building.id}
              onClick={() => setSelectedBuildingId(building.id)}
            >
              {building.name}
            </button>
          ))}
        </div>
      )}

      {entries && entries.length > 0 && (
        <div className={styles.filterRow}>
          <label htmlFor={searchId}>Search ledger</label>
          <input
            id={searchId}
            type="search"
            className={styles.searchInput}
            placeholder="Search by building, device, DOB #, or status"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>
      )}

      {entries && entries.length > 0 && (
        <div className={styles.filterRow}>
          <label htmlFor={statusFilterId}>Filter by status</label>
          <select
            id={statusFilterId}
            value={selectedStatus ?? ""}
            onChange={(event) => {
              const { value } = event.target;
              setSelectedStatus(value === "" ? undefined : (value as ComplianceStatus));
            }}
          >
            <option value="">All statuses</option>
            {STATUS_FILTER_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
      )}

      {visibleEntries && visibleEntries.length === 0 ? (
        <EmptyState onSeeded={onSeeded} />
      ) : visibleEntries && visibleEntries.length > 0 ? (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            {/* tabIndex={-1}: focusable only via captionRef.current.focus()
                (see handleDeleteConfirm), never added to the tab order. */}
            <caption ref={captionRef} tabIndex={-1}>
              Portfolio compliance ledger, sorted by urgency
            </caption>
            <thead>
              <tr>
                {SORTABLE_COLUMNS.map(({ column, label }) => {
                  const isActive = sort?.column === column;
                  const direction = isActive ? sort.direction : null;
                  const ariaLabel =
                    direction === "ascending"
                      ? `Sort by ${label}, descending`
                      : direction === "descending"
                        ? `Clear sort by ${label}`
                        : `Sort by ${label}, ascending`;

                  return (
                    <th key={column} scope="col" aria-sort={direction ?? undefined}>
                      <button
                        type="button"
                        className={styles.sortButton}
                        aria-label={ariaLabel}
                        onClick={() => handleSortClick(column)}
                      >
                        {label}
                        <span
                          aria-hidden="true"
                          className={
                            direction
                              ? styles.sortIndicator
                              : `${styles.sortIndicator} ${styles.sortIndicatorNeutral}`
                          }
                        >
                          {direction === "ascending" ? "▲" : direction === "descending" ? "▼" : "⇅"}
                        </span>
                      </button>
                    </th>
                  );
                })}
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {groupByBuilding
                ? groupedEntries.flatMap((group) => [
                    <tr key={`group-${group.buildingName}`} className={styles.groupRow}>
                      <td colSpan={COLUMN_COUNT}>
                        {group.buildingName} — {group.entries.length} device
                        {group.entries.length === 1 ? "" : "s"}
                      </td>
                    </tr>,
                    ...group.entries.map((entry) => renderEntryRow(entry)),
                  ])
                : visibleEntries.map((entry) => renderEntryRow(entry))}
            </tbody>
          </table>
        </div>
      ) : null}

      <ElevatorDetailDrawer entry={detailDrawerEntry} onClose={() => setDetailDrawerEntry(null)} />
    </div>
  );
}
