import type { CalculatorSettings, ComputationIssue, WorkspaceState, WorkspaceToolId } from "@core/contracts";
import type { HistoryEntry, HistoryModeMetadata } from "../features/history/model";
import type { MemoryRegister } from "../features/memory/model";

export interface WorkspacePresentation {
  tool: WorkspaceToolId;
  title: string;
  detail: string;
  value: string;
  issues: ComputationIssue[];
}

function formatMatrixLabel(rows: number, columns: number): string {
  return `${rows} x ${columns}`;
}

export function buildModeMetadata(settings: CalculatorSettings): HistoryModeMetadata {
  return {
    backend: settings.numeric.backend,
    angleMode: settings.numeric.angleMode,
    displayMode: settings.numeric.displayMode,
    displayPrecision: settings.numeric.displayPrecision
  };
}

export function summarizeWorkspace(workspace: WorkspaceState): WorkspacePresentation {
  switch (workspace.activeTool) {
    case "calculate":
      return {
        tool: "calculate",
        title: "Expression Draft",
        detail: workspace.expressionInput.trim() || "No expression drafted yet.",
        value: workspace.expressionInput.trim() || "Awaiting input",
        issues: workspace.expressionInput.trim()
          ? []
          : [{ code: "empty-expression", message: "Add an expression to capture a useful snapshot.", severity: "warning" }]
      };
    case "matrix":
      return {
        tool: "matrix",
        title: "Matrix Workspace",
        detail: `Left ${formatMatrixLabel(workspace.matrix.left.rows, workspace.matrix.left.columns)} / Right ${formatMatrixLabel(
          workspace.matrix.right?.rows ?? 2,
          workspace.matrix.right?.columns ?? 2
        )}`,
        value: `Ready for persisted matrix drafts`,
        issues: []
      };
    case "solver":
      return {
        tool: "solver",
        title: "Solver Draft",
        detail: workspace.solver.expression.trim() || "No solver expression drafted yet.",
        value: `${workspace.solver.method} | x0=${workspace.solver.initialGuess}`,
        issues: workspace.solver.expression.trim()
          ? []
          : [{ code: "empty-solver-expression", message: "Add a solver expression before storing a snapshot.", severity: "warning" }]
      };
    case "numerical":
      return {
        tool: "numerical",
        title: "Numerical Draft",
        detail: workspace.numerical.expression.trim() || "No numerical expression drafted yet.",
        value: `${workspace.numerical.tool} | [${workspace.numerical.intervalStart}, ${workspace.numerical.intervalEnd}]`,
        issues: workspace.numerical.expression.trim()
          ? []
          : [{ code: "empty-numerical-expression", message: "Add an expression before storing a numerical snapshot.", severity: "warning" }]
      };
  }
}

export function createHistoryEntry(
  workspace: WorkspaceState,
  settings: CalculatorSettings,
  timestamp: string,
  id: string
): HistoryEntry {
  const presentation = summarizeWorkspace(workspace);

  return {
    id,
    tool: presentation.tool,
    title: presentation.title,
    detail: presentation.detail,
    value: presentation.value,
    createdAt: timestamp,
    mode: buildModeMetadata(settings)
  };
}

export function captureRegister(
  register: MemoryRegister,
  workspace: WorkspaceState,
  settings: CalculatorSettings,
  timestamp: string
): MemoryRegister {
  const presentation = summarizeWorkspace(workspace);

  return {
    ...register,
    value: presentation.value,
    detail: presentation.detail,
    sourceTool: presentation.tool,
    updatedAt: timestamp,
    mode: buildModeMetadata(settings)
  };
}
