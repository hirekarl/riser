import { useEffect, useState } from "react";
import { listBuildings } from "./api/client";
import { LedgerPage } from "./features/ledger/LedgerPage";
import { BuildingForm } from "./features/portfolio/BuildingForm";
import { ElevatorForm } from "./features/portfolio/ElevatorForm";
import type { EditableElevator } from "./features/portfolio/ElevatorForm";
import type { Building, LedgerEntry } from "./types/domain";
import styles from "./App.module.css";

function App() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [reloadSignal, setReloadSignal] = useState(0);
  const [editingElevator, setEditingElevator] = useState<EditableElevator | null>(null);

  useEffect(() => {
    listBuildings()
      .then(setBuildings)
      .catch(() => {
        // The ledger view surfaces its own load error; the building list is
        // only needed to populate the elevator form's dropdown.
      });
    // Fetch once on mount only. Building creation updates `buildings` locally
    // (below) using the API response directly, so this never needs to re-run.
  }, []);

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
        <h1>Riser</h1>
        <p>NYC elevator compliance ledger, ranked by risk across your portfolio.</p>
      </header>

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
        <h2 className="visually-hidden">Portfolio ledger</h2>
        <LedgerPage
          reloadSignal={reloadSignal}
          buildings={buildings}
          onEditRequest={handleEditRequest}
          editingElevatorId={editingElevator?.id}
        />
      </main>
    </div>
  );
}

export default App;
