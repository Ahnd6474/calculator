import { describe, expect, it } from "vitest";
import { createHistoryEntry, captureRegister } from "../app/workspacePreview";
import { createDefaultCalculatorSettings } from "../features/settings/model";
import { createDefaultMemoryRegisters } from "../features/memory/model";
import { createDefaultWorkspaceState } from "../app/workspaceDrafts";
import { createCalculatorPersistence, createMemoryStorage } from "./store";

describe("calculator persistence", () => {
  it("loads defaults when storage is empty", () => {
    const persistence = createCalculatorPersistence(createMemoryStorage(), () => "2026-03-27T00:00:00.000Z");
    const snapshot = persistence.loadSnapshot();

    expect(snapshot.settings.version).toBe(1);
    expect(snapshot.workspace.payload.activeTool).toBe("calculate");
    expect(snapshot.history.payload.entries).toHaveLength(0);
    expect(snapshot.memory.payload.registers.map((register) => register.label)).toEqual(["M1", "M2", "M3", "M4"]);
  });

  it("persists versioned settings, workspace, history, and memory documents", () => {
    const storage = createMemoryStorage();
    const persistence = createCalculatorPersistence(storage, () => "2026-03-27T01:00:00.000Z");
    const settings = createDefaultCalculatorSettings();
    const workspace = createDefaultWorkspaceState();

    const nextSettings = {
      ...settings,
      numeric: {
        ...settings.numeric,
        displayPrecision: 18,
        angleMode: "degree" as const,
        displayMode: "engineering" as const
      }
    };
    const nextWorkspace = {
      ...workspace,
      activeTool: "solver" as const,
      solver: {
        ...workspace.solver,
        expression: "cos(x) - x",
        method: "bisection" as const
      }
    };
    const historyEntry = createHistoryEntry(nextWorkspace, nextSettings, "2026-03-27T01:00:00.000Z", "h-1");
    const memoryRegister = captureRegister(
      createDefaultMemoryRegisters()[0]!,
      nextWorkspace,
      nextSettings,
      "2026-03-27T01:00:00.000Z"
    );

    persistence.saveSettings(nextSettings);
    persistence.saveWorkspace(nextWorkspace);
    persistence.saveHistory([historyEntry]);
    persistence.saveMemory([memoryRegister]);

    const restored = createCalculatorPersistence(storage, () => "2026-03-27T01:05:00.000Z").loadSnapshot();

    expect(restored.settings.updatedAt).toBe("2026-03-27T01:00:00.000Z");
    expect(restored.settings.payload.numeric.displayPrecision).toBe(18);
    expect(restored.workspace.payload.activeTool).toBe("solver");
    expect(restored.workspace.payload.solver.expression).toBe("cos(x) - x");
    expect(restored.history.payload.entries[0]).toEqual(historyEntry);
    expect(restored.memory.payload.registers[0]).toEqual(memoryRegister);
  });

  it("falls back only the corrupted document while preserving valid neighbors", () => {
    const storage = createMemoryStorage();
    const persistence = createCalculatorPersistence(storage, () => "2026-03-27T02:00:00.000Z");
    const settings = createDefaultCalculatorSettings();
    const workspace = createDefaultWorkspaceState();

    persistence.saveSettings({
      ...settings,
      numeric: {
        ...settings.numeric,
        displayPrecision: 200
      }
    });
    persistence.saveWorkspace({
      ...workspace,
      activeTool: "numerical",
      numerical: {
        ...workspace.numerical,
        expression: "exp(-x^2)"
      }
    });

    storage.setItem("calculator.settings.v1", "{");

    const restored = createCalculatorPersistence(storage, () => "2026-03-27T02:05:00.000Z").loadSnapshot();

    expect(restored.settings.payload.numeric.displayPrecision).toBe(12);
    expect(restored.workspace.payload.activeTool).toBe("numerical");
    expect(restored.workspace.payload.numerical.expression).toBe("exp(-x^2)");
  });

  it("sanitizes restored settings and workspace values into supported ranges", () => {
    const storage = createMemoryStorage();

    storage.setItem(
      "calculator.settings.v1",
      JSON.stringify({
        version: 1,
        updatedAt: "2026-03-27T03:00:00.000Z",
        payload: {
          numeric: {
            backend: "decimal",
            displayPrecision: 300,
            internalPrecision: 2,
            solverTolerance: 1,
            maxIterations: 0,
            angleMode: "degree",
            displayMode: "scientific"
          },
          locale: "ko-KR"
        }
      })
    );

    storage.setItem(
      "calculator.workspace.v1",
      JSON.stringify({
        version: 1,
        updatedAt: "2026-03-27T03:00:00.000Z",
        payload: {
          ...createDefaultWorkspaceState(),
          activeTool: "matrix",
          matrix: {
            left: { rows: 9, columns: 1, values: [[1], [2], [3]] },
            right: { rows: 1, columns: 8, values: [[4, 5, 6]] }
          }
        }
      })
    );

    const restored = createCalculatorPersistence(storage, () => "2026-03-27T03:05:00.000Z").loadSnapshot();

    expect(restored.settings.payload.numeric.displayPrecision).toBe(24);
    expect(restored.settings.payload.numeric.internalPrecision).toBe(16);
    expect(restored.settings.payload.numeric.solverTolerance).toBe(1e-3);
    expect(restored.settings.payload.numeric.maxIterations).toBe(5);
    expect(restored.workspace.payload.matrix.left.rows).toBe(6);
    expect(restored.workspace.payload.matrix.left.columns).toBe(2);
    expect(restored.workspace.payload.matrix.right?.rows).toBe(2);
    expect(restored.workspace.payload.matrix.right?.columns).toBe(6);
  });
});
