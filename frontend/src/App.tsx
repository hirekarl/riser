import { useCallback, useEffect, useState } from "react";
import { listBuildings } from "./api/client";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LedgerPage } from "./features/ledger/LedgerPage";
import { NarrationPanel } from "./features/narration/NarrationPanel";
import { BuildingForm } from "./features/portfolio/BuildingForm";
import { ElevatorForm } from "./features/portfolio/ElevatorForm";
import type { EditableElevator } from "./features/portfolio/ElevatorForm";
import { logError } from "./lib/logger";
import type { Building, LedgerEntry } from "./types/domain";
import styles from "./App.module.css";

function App() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingsError, setBuildingsError] = useState<string | null>(null);
  const [reloadSignal, setReloadSignal] = useState(0);
  const [editingElevator, setEditingElevator] = useState<EditableElevator | null>(null);

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

  function handleBuildingCreated(building: Building) {
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

      <main>
        {/* Placed above the ledger as the page's lead feature, per the v3
            design pass (docs/design/) — matches the "AI Executive
            Briefing" position in the reference mockup. */}
        <NarrationPanel />
        <h2 className="visually-hidden">Portfolio ledger</h2>
        <ErrorBoundary>
          <LedgerPage
            reloadSignal={reloadSignal}
            buildings={buildings}
            onEditRequest={handleEditRequest}
            editingElevatorId={editingElevator?.id}
          />
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default App;
