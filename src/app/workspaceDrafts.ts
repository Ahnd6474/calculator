import type { MatrixData, WorkspaceState } from "@core/contracts";

function clampDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return 2;
  }

  return Math.min(6, Math.max(2, Math.round(value)));
}

function normalizeMatrixCell(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function createDefaultMatrixData(): MatrixData {
  return {
    rows: 2,
    columns: 2,
    values: [
      [1, 0],
      [0, 1]
    ]
  };
}

export function resizeMatrix(matrix: MatrixData, rows: number, columns: number): MatrixData {
  const nextRows = clampDimension(rows);
  const nextColumns = clampDimension(columns);
  const nextValues = Array.from({ length: nextRows }, (_, rowIndex) =>
    Array.from({ length: nextColumns }, (_, columnIndex) => normalizeMatrixCell(matrix.values[rowIndex]?.[columnIndex]))
  );

  return {
    rows: nextRows,
    columns: nextColumns,
    values: nextValues
  };
}

export function updateMatrixCell(
  matrix: MatrixData,
  rowIndex: number,
  columnIndex: number,
  value: number
): MatrixData {
  const next = resizeMatrix(matrix, matrix.rows, matrix.columns);
  next.values[rowIndex]![columnIndex] = Number.isFinite(value) ? value : 0;
  return next;
}

export function createDefaultWorkspaceState(): WorkspaceState {
  return {
    activeTool: "calculate",
    expressionInput: "",
    matrix: {
      left: createDefaultMatrixData(),
      right: createDefaultMatrixData()
    },
    solver: {
      expression: "",
      method: "newton",
      initialGuess: "0",
      bracketLower: "-1",
      bracketUpper: "1"
    },
    numerical: {
      expression: "",
      tool: "differentiate",
      point: "0",
      intervalStart: "0",
      intervalEnd: "1"
    }
  };
}

export function sanitizeWorkspaceState(workspace: WorkspaceState): WorkspaceState {
  const rightMatrix = workspace.matrix.right
    ? resizeMatrix(workspace.matrix.right, workspace.matrix.right.rows, workspace.matrix.right.columns)
    : createDefaultMatrixData();

  return {
    activeTool: workspace.activeTool,
    expressionInput: workspace.expressionInput,
    matrix: {
      left: resizeMatrix(workspace.matrix.left, workspace.matrix.left.rows, workspace.matrix.left.columns),
      right: rightMatrix
    },
    solver: {
      expression: workspace.solver.expression,
      method: workspace.solver.method,
      initialGuess: workspace.solver.initialGuess,
      bracketLower: workspace.solver.bracketLower,
      bracketUpper: workspace.solver.bracketUpper
    },
    numerical: {
      expression: workspace.numerical.expression,
      tool: workspace.numerical.tool,
      point: workspace.numerical.point,
      intervalStart: workspace.numerical.intervalStart,
      intervalEnd: workspace.numerical.intervalEnd
    }
  };
}
