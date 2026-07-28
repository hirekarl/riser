import { useCallback, useEffect, useState } from "react";
import { listBuildings, listLedger } from "./api/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LedgerPage } from "./features/ledger/LedgerPage";
import { NarrationPanel } from "./features/narration/NarrationPanel";
import { AddressLookupForm } from "./features/portfolio/AddressLookupForm";
import { BuildingForm } from "./features/portfolio/BuildingForm";
import { BuildingList } from "./features/portfolio/BuildingList";
import { ElevatorForm } from "./features/portfolio/ElevatorForm";
import type { EditableElevator } from "./features/portfolio/ElevatorForm";
import { TimelinePage } from "./features/timeline/TimelinePage";
import { logError } from "./lib/logger";
import type { Building, LedgerEntry } from "./types/domain";
import styles from "./App.module.css";

type Tab = "ledger" | "timeline";

function App() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingsError, setBuildingsError] = useState<string | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [reloadSignal, setReloadSignal] = useState(0);
  const [editingElevator, setEditingElevator] = useState<EditableElevator | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("ledger");

  const loadBuildings = useCallback(() => {
    return listBuildings()
      .then((data) => {
        setBuildings(data);
        setBuildingsError(null);
      })
      .catch((error: unknown) => {
        logError("Failed to load buildings", error);
        setBuildingsError("Could not load buildings. Please try again.");
      });
  }, []);

  useEffect(() => {
    loadBuildings();
    // Fetch once on mount only (plus explicit retries via `loadBuildings`).
    // Building creation updates `buildings` locally (below) using the API
    // response directly, so this never needs to re-run on its own.
  }, [loadBuildings]);

  useEffect(() => {
    // Owned here (rather than inside LedgerPage) so both LedgerPage and
    // TimelinePage share a single `listLedger()` call/refetch trigger
    // instead of each independently fetching the same data.
    let ignore = false;

    listLedger()
      .then((data) => {
        if (ignore) return;
        setEntries(data);
        setEntriesError(null);
      })
      .catch((error: unknown) => {
        if (ignore) return;
        logError("Failed to load ledger", error);
        setEntriesError("Could not load the ledger. Please try again.");
      });

    return () => {
      ignore = true;
    };
    // reloadSignal is an intentional refetch trigger, not consumed directly.
  }, [reloadSignal]);

  function handleBuildingCreated(building: Building) {
    setBuildings((current) => [...current, building]);
    setReloadSignal((n) => n + 1);
  }

  // Address lookup calls createBuilding + createElevator itself (see
  // AddressLookupForm), then hands the finished building back here once
  // everything is saved, so this mirrors handleBuildingCreated exactly.
  function handleAddressLookupSaved(building: Building) {
    setBuildings((current) => [...current, building]);
    setReloadSignal((n) => n + 1);
  }

  function handleElevatorCreated() {
    setReloadSignal((n) => n + 1);
  }

  function handleEditRequest(entry: LedgerEntry) {
    setEditingElevator({
      id: entry.id,
      device_identifier: entry.device_identifier,
      inspection_type: entry.inspection_type,
      last_inspection_date: entry.last_inspection_date,
    });
  }

  function handleElevatorUpdated() {
    setReloadSignal((n) => n + 1);
    setEditingElevator(null);
  }

  function handleEditCancel() {
    setEditingElevator(null);
  }

  // Distinct from handleElevatorUpdated: an inline Save in the ledger table
  // itself (not the Edit form) has no open edit-form target to clear, so
  // this must not touch `editingElevator` — otherwise it would close an
  // unrelated in-progress Edit form for a different row.
  function handleLedgerEntryUpdated() {
    setReloadSignal((n) => n + 1);
  }

  // A deleted building cascade-deletes its elevators server-side, so both
  // the buildings list itself (dropdowns, the building-management surface)
  // and the shared ledger need to be refreshed.
  function handleBuildingDeleted() {
    setReloadSignal((n) => n + 1);
    loadBuildings();
  }

  // Demo-data seeding is additive (never destructive, per the backend
  // contract), so this mirrors the other "something new was created
  // elsewhere" handlers above rather than needing its own bespoke path.
  function handleDemoDataSeeded() {
    setReloadSignal((n) => n + 1);
  }

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <h1>
          <span className={styles.wordmarkRust}>RI</span>
          <span className={styles.wordmarkNavy}>SER</span>
        </h1>
        <p>NYC elevator compliance ledger, ranked by risk across your portfolio.</p>
      </header>

      {buildingsError && (
        <div className={styles.errorBanner} role="alert">
          {buildingsError}
          <button type="button" onClick={() => loadBuildings()}>
            Retry
          </button>
        </div>
      )}

      <AddressLookupForm onSaved={handleAddressLookupSaved} />

      <div className={styles.formsRow}>
        <BuildingForm onCreated={handleBuildingCreated} />
        <ElevatorForm
          buildings={buildings}
          onCreated={handleElevatorCreated}
          editingElevator={editingElevator}
          onUpdated={handleElevatorUpdated}
          onEditCancel={handleEditCancel}
        />
      </div>

      <BuildingList buildings={buildings} onDeleted={handleBuildingDeleted} />

      <main>
        {/* Placed above the ledger as the page's lead feature, per the v3
            design pass (docs/design/) — matches the "AI Executive
            Briefing" position in the reference mockup. */}
        <NarrationPanel />

        <div role="tablist" aria-label="Ledger views" className={styles.tabList}>
          <button
            type="button"
            role="tab"
            id="ledger-tab"
            aria-selected={activeTab === "ledger"}
            aria-controls="ledger-panel"
            className={styles.tab}
            onClick={() => setActiveTab("ledger")}
          >
            Ledger
          </button>
          <button
            type="button"
            role="tab"
            id="timeline-tab"
            aria-selected={activeTab === "timeline"}
            aria-controls="timeline-panel"
            className={styles.tab}
            onClick={() => setActiveTab("timeline")}
          >
            Timeline
          </button>
        </div>

        <div
          role="tabpanel"
          id="ledger-panel"
          aria-labelledby="ledger-tab"
          hidden={activeTab !== "ledger"}
        >
          <h2 className="visually-hidden">Portfolio ledger</h2>
          {/* Only the active tab's page component is mounted — besides
              avoiding pointless work for the hidden tab, this also
              sidesteps the same LedgerEntry data being findable twice
              (once per view) if both were mounted simultaneously. Both
              `<div role="tabpanel">` wrappers stay in the DOM regardless,
              toggled via `hidden`, so `aria-controls` on each tab always
              points at a real element. */}
          {activeTab === "ledger" && (
            <ErrorBoundary>
              <LedgerPage
                entries={entries}
                error={entriesError}
                buildings={buildings}
                onEditRequest={handleEditRequest}
                editingElevatorId={editingElevator?.id}
                onElevatorUpdated={handleLedgerEntryUpdated}
                onSeeded={handleDemoDataSeeded}
              />
            </ErrorBoundary>
          )}
        </div>

        <div
          role="tabpanel"
          id="timeline-panel"
          aria-labelledby="timeline-tab"
          hidden={activeTab !== "timeline"}
        >
          <h2 className="visually-hidden">Upcoming compliance due dates</h2>
          {activeTab === "timeline" && (
            <ErrorBoundary>
              <TimelinePage entries={entries} error={entriesError} />
            </ErrorBoundary>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
