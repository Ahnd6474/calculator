import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type {
  CalculatorSettings,
  ComputationIssue,
  LinearSystemResult,
  MatrixData,
  MatrixDraft,
  MatrixOperation,
  MatrixOperationResult,
  ResultEnvelope
} from "@core/contracts";
import { MAX_MATRIX_SIZE } from "@core/matrix";
import { createDefaultWorkspaceState } from "../../app/workspaceDrafts";
import { createMatrixService } from "../../services/matrix";

type MatrixAction = MatrixOperation | "solve";

interface MatrixWorkbenchProps {
  settings: CalculatorSettings;
  draft: MatrixDraft;
  result: ResultEnvelope<MatrixOperationResult | LinearSystemResult> | null;
  onDraftChange(recipe: (current: MatrixDraft) => MatrixDraft): void;
  onResultChange: Dispatch<SetStateAction<ResultEnvelope<MatrixOperationResult | LinearSystemResult> | null>>;
}

const matrixService = createMatrixService();
const defaultDraft = createDefaultWorkspaceState().matrix;

const actionLabels: Record<MatrixAction, string> = {
  add: "Add",
  subtract: "Subtract",
  multiply: "Multiply",
  transpose: "Transpose",
  determinant: "Determinant",
  inverse: "Inverse",
  solve: "Solve Ax = b"
};

const binaryActions: MatrixAction[] = ["add", "subtract", "multiply"];

export function MatrixWorkbench({
  settings,
  draft,
  result,
  onDraftChange,
  onResultChange
}: MatrixWorkbenchProps) {
  const [action, setAction] = useState<MatrixAction>("solve");
  const [leftSize, setLeftSize] = useState({ rows: draft.left.rows, columns: draft.left.columns });
  const [rightSize, setRightSize] = useState({
    rows: draft.right?.rows ?? draft.left.rows,
    columns: draft.right?.columns ?? draft.left.columns
  });
  const [leftValues, setLeftValues] = useState(() => toDraftValues(draft.left));
  const [rightValues, setRightValues] = useState(() => toDraftValues(draft.right ?? draft.left));
  const [rightHandSide, setRightHandSide] = useState(() => createVectorDraft(draft.left.rows));

  const usesRightMatrix = binaryActions.includes(action);
  const usesRightHandSide = action === "solve";

  useEffect(() => {
    setLeftSize({ rows: draft.left.rows, columns: draft.left.columns });
    setRightSize({
      rows: draft.right?.rows ?? draft.left.rows,
      columns: draft.right?.columns ?? draft.left.columns
    });
    setLeftValues(toDraftValues(draft.left));
    setRightValues(toDraftValues(draft.right ?? draft.left));
  }, [draft]);

  useEffect(() => {
    onResultChange(null);
  }, [action, leftSize, leftValues, onResultChange, rightHandSide, rightSize, rightValues, settings]);

  function updateLeftSize(nextRows: number, nextColumns: number) {
    const nextValues = resizeDraftMatrix(leftValues, nextRows, nextColumns);
    setLeftSize({ rows: nextRows, columns: nextColumns });
    setLeftValues(nextValues);
    setRightHandSide((current) => resizeDraftVector(current, nextRows));
    onDraftChange((current) => ({
      ...current,
      left: toPersistedMatrix(nextValues, nextRows, nextColumns)
    }));
  }

  function updateRightSize(nextRows: number, nextColumns: number) {
    const nextValues = resizeDraftMatrix(rightValues, nextRows, nextColumns);
    setRightSize({ rows: nextRows, columns: nextColumns });
    setRightValues(nextValues);
    onDraftChange((current) => ({
      ...current,
      right: toPersistedMatrix(nextValues, nextRows, nextColumns)
    }));
  }

  function submit() {
    if (action === "solve") {
      const coefficientMatrix = parseMatrixDraft(leftValues, leftSize.rows, leftSize.columns);
      const vector = parseVectorDraft(rightHandSide, leftSize.rows);

      if (!coefficientMatrix.ok) {
        onResultChange(failEnvelope(settings, [coefficientMatrix.issue]));
        return;
      }

      if (!vector.ok) {
        onResultChange(failEnvelope(settings, [vector.issue]));
        return;
      }

      const startedAt = nowMs();
      void Promise.resolve(
        matrixService.solveLinearSystem({
          matrix: coefficientMatrix.value,
          rightHandSide: vector.value,
          settings
        })
      ).then((response) => onResultChange(withElapsedMetadata(response, startedAt)));
      return;
    }

    const leftMatrix = parseMatrixDraft(leftValues, leftSize.rows, leftSize.columns);
    if (!leftMatrix.ok) {
      onResultChange(failEnvelope(settings, [leftMatrix.issue]));
      return;
    }

    const rightMatrix = usesRightMatrix
      ? parseMatrixDraft(rightValues, rightSize.rows, rightSize.columns)
      : null;

    if (rightMatrix !== null && !rightMatrix.ok) {
      onResultChange(failEnvelope(settings, [rightMatrix.issue]));
      return;
    }

    const request =
      rightMatrix !== null
        ? {
            operation: action,
            left: leftMatrix.value,
            right: rightMatrix.value,
            settings
          }
        : {
            operation: action,
            left: leftMatrix.value,
            settings
          };

    const startedAt = nowMs();
    void Promise.resolve(matrixService.evaluate(request)).then((response) =>
      onResultChange(withElapsedMetadata(response, startedAt))
    );
  }

  function resetDrafts() {
    setAction("solve");
    setLeftSize({ rows: defaultDraft.left.rows, columns: defaultDraft.left.columns });
    setRightSize({
      rows: defaultDraft.right?.rows ?? defaultDraft.left.rows,
      columns: defaultDraft.right?.columns ?? defaultDraft.left.columns
    });
    setLeftValues(toDraftValues(defaultDraft.left));
    setRightValues(toDraftValues(defaultDraft.right ?? defaultDraft.left));
    setRightHandSide(createVectorDraft(defaultDraft.left.rows));
    onDraftChange(() => defaultDraft);
    onResultChange(null);
  }

  return (
    <section className="matrix-workbench">
      <header className="matrix-toolbar">
        <div>
          <p className="eyebrow">Matrix mode</p>
          <h3>Stable linear algebra workspace</h3>
          <p className="matrix-caption">
            Partial pivoting is used for determinant, inverse, and linear solve. Matrix sizes are limited to
            2 through {MAX_MATRIX_SIZE} per dimension in this workflow.
          </p>
        </div>
        <div className="matrix-toolbar-actions">
          <label className="field-stack">
            <span>Action</span>
            <select value={action} onChange={(event) => setAction(event.target.value as MatrixAction)}>
              {(Object.keys(actionLabels) as MatrixAction[]).map((candidate) => (
                <option key={candidate} value={candidate}>
                  {actionLabels[candidate]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary-button" onClick={resetDrafts}>
            Reset drafts
          </button>
          <button type="button" className="primary-button" onClick={submit}>
            Run matrix task
          </button>
        </div>
      </header>

      <div className="matrix-meta-strip">
        <span>Backend: {settings.numeric.backend}</span>
        <span>Tolerance: {formatCompact(settings.numeric.solverTolerance)}</span>
        <span>Display: {settings.numeric.displayMode}</span>
        <span>Precision: {settings.numeric.displayPrecision} digits</span>
      </div>

      <div className="matrix-pane-grid">
        <MatrixEditor
          title="Left matrix A"
          size={leftSize}
          values={leftValues}
          onSizeChange={updateLeftSize}
          onValuesChange={(nextValues) => {
            setLeftValues(nextValues);
            const nextMatrix = toPersistedMatrixOrNull(nextValues, leftSize.rows, leftSize.columns);
            if (nextMatrix) {
              onDraftChange((current) => ({
                ...current,
                left: nextMatrix
              }));
            }
          }}
        />

        {usesRightMatrix ? (
          <MatrixEditor
            title="Right matrix B"
            size={rightSize}
            values={rightValues}
            onSizeChange={updateRightSize}
            onValuesChange={(nextValues) => {
              setRightValues(nextValues);
              const nextMatrix = toPersistedMatrixOrNull(nextValues, rightSize.rows, rightSize.columns);
              if (nextMatrix) {
                onDraftChange((current) => ({
                  ...current,
                  right: nextMatrix
                }));
              }
            }}
          />
        ) : usesRightHandSide ? (
          <VectorEditor values={rightHandSide} onValuesChange={setRightHandSide} />
        ) : (
          <article className="matrix-pane matrix-note-pane">
            <h4>Unary operation</h4>
            <p className="matrix-caption">
              This action only uses matrix A. The result panel shows the transformed matrix or scalar output
              together with singularity and conditioning diagnostics when relevant.
            </p>
          </article>
        )}
      </div>

      <ResultPanel result={result} settings={settings} />
    </section>
  );
}

interface MatrixEditorProps {
  title: string;
  size: {
    rows: number;
    columns: number;
  };
  values: string[][];
  onSizeChange: (rows: number, columns: number) => void;
  onValuesChange: (values: string[][]) => void;
}

function MatrixEditor({ title, size, values, onSizeChange, onValuesChange }: MatrixEditorProps) {
  return (
    <article className="matrix-pane">
      <header className="matrix-pane-header">
        <h4>{title}</h4>
        <div className="matrix-dimension-controls">
          <label className="field-stack">
            <span>Rows</span>
            <select
              value={size.rows}
              onChange={(event) => onSizeChange(Number(event.target.value), size.columns)}
            >
              {dimensionOptions()}
            </select>
          </label>
          <label className="field-stack">
            <span>Columns</span>
            <select
              value={size.columns}
              onChange={(event) => onSizeChange(size.rows, Number(event.target.value))}
            >
              {dimensionOptions()}
            </select>
          </label>
        </div>
      </header>
      <div
        className="matrix-grid"
        style={{ gridTemplateColumns: `repeat(${size.columns}, minmax(0, 1fr))` }}
      >
        {values.map((row, rowIndex) =>
          row.map((value, columnIndex) => (
            <input
              key={`${rowIndex}-${columnIndex}`}
              className="matrix-cell"
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(event) =>
                onValuesChange(
                  values.map((candidateRow, candidateRowIndex) =>
                    candidateRowIndex === rowIndex
                      ? candidateRow.map((candidateValue, candidateColumnIndex) =>
                          candidateColumnIndex === columnIndex ? event.target.value : candidateValue
                        )
                      : candidateRow
                  )
                )
              }
            />
          ))
        )}
      </div>
    </article>
  );
}

interface VectorEditorProps {
  values: string[];
  onValuesChange: (values: string[]) => void;
}

function VectorEditor({ values, onValuesChange }: VectorEditorProps) {
  return (
    <article className="matrix-pane">
      <header className="matrix-pane-header">
        <h4>Right-hand side b</h4>
        <p className="matrix-caption">Enter one entry per row of matrix A.</p>
      </header>
      <div className="vector-grid">
        {values.map((value, index) => (
          <input
            key={index}
            className="matrix-cell"
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(event) =>
              onValuesChange(
                values.map((candidate, candidateIndex) =>
                  candidateIndex === index ? event.target.value : candidate
                )
              )
            }
          />
        ))}
      </div>
    </article>
  );
}

interface ResultPanelProps {
  result: ResultEnvelope<MatrixOperationResult | LinearSystemResult> | null;
  settings: CalculatorSettings;
}

function ResultPanel({ result, settings }: ResultPanelProps) {
  if (!result) {
    return (
      <article className="matrix-result-panel">
        <h4>Result</h4>
        <p className="matrix-caption">Run a matrix task to see outputs, diagnostics, and explicit issues.</p>
      </article>
    );
  }

  return (
    <article className="matrix-result-panel">
      <header className="matrix-pane-header">
        <h4>Result</h4>
        <span className={result.ok ? "status-badge status-ok" : "status-badge status-error"}>
          {result.ok ? "Computed" : "Blocked"}
        </span>
      </header>

      {result.issues.length > 0 ? (
        <div className="issue-stack">
          {result.issues.map((issue) => (
            <div
              key={`${issue.code}-${issue.field ?? "general"}`}
              className={issue.severity === "warning" ? "issue-chip issue-warning" : "issue-chip issue-error"}
            >
              <strong>{issue.code}</strong>
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      ) : null}

      {result.ok ? (
        <ResultValue value={result.value} settings={settings} />
      ) : (
        <p className="matrix-caption">Fix the flagged input or matrix condition issue and run the task again.</p>
      )}
    </article>
  );
}

function ResultValue({
  value,
  settings
}: {
  value: MatrixOperationResult | LinearSystemResult;
  settings: CalculatorSettings;
}) {
  if ("solution" in value) {
    return (
      <>
        <div className="solution-list">
          {value.solution.map((entry, index) => (
            <div key={index} className="solution-chip">
              <strong>x{index + 1}</strong>
              <span>{formatCompact(entry, settings.numeric.displayPrecision)}</span>
            </div>
          ))}
        </div>
        <DiagnosticsSummary
          residualNorm={value.residualNorm}
          conditionEstimate={value.diagnostics?.conditionEstimate}
          pivotStrategy={value.diagnostics?.pivotStrategy}
        />
      </>
    );
  }

  return (
    <>
      {value.scalar ? <p className="scalar-result">{value.scalar}</p> : null}
      {value.matrix ? <MatrixPreview matrix={value.matrix} precision={settings.numeric.displayPrecision} /> : null}
      <DiagnosticsSummary
        residualNorm={undefined}
        conditionEstimate={value.diagnostics?.conditionEstimate}
        pivotStrategy={value.diagnostics?.pivotStrategy}
      />
    </>
  );
}

function DiagnosticsSummary({
  residualNorm,
  conditionEstimate,
  pivotStrategy
}: {
  residualNorm: number | undefined;
  conditionEstimate: number | undefined;
  pivotStrategy: string | undefined;
}) {
  return (
    <div className="diagnostic-grid">
      <div>
        <dt>Pivoting</dt>
        <dd>{pivotStrategy ?? "n/a"}</dd>
      </div>
      {residualNorm !== undefined ? (
        <div>
          <dt>Residual norm</dt>
          <dd>{formatCompact(residualNorm)}</dd>
        </div>
      ) : null}
      {conditionEstimate !== undefined ? (
        <div>
          <dt>Condition estimate</dt>
          <dd>{formatCompact(conditionEstimate)}</dd>
        </div>
      ) : null}
    </div>
  );
}

function MatrixPreview({ matrix, precision }: { matrix: MatrixData; precision: number }) {
  return (
    <div
      className="matrix-preview-grid"
      style={{ gridTemplateColumns: `repeat(${matrix.columns}, minmax(0, 1fr))` }}
    >
      {matrix.values.flatMap((row, rowIndex) =>
        row.map((value, columnIndex) => (
          <span key={`${rowIndex}-${columnIndex}`} className="matrix-preview-cell">
            {formatCompact(value, precision)}
          </span>
        ))
      )}
    </div>
  );
}

function toDraftValues(matrix: MatrixData): string[][] {
  return matrix.values.map((row) => row.map((value) => value.toString()));
}

function createVectorDraft(size: number): string[] {
  return Array.from({ length: size }, (_, index) => (index === 0 ? "1" : "0"));
}

function resizeDraftMatrix(values: string[][], rows: number, columns: number): string[][] {
  return Array.from({ length: rows }, (_, rowIndex) =>
    Array.from({ length: columns }, (_, columnIndex) => values[rowIndex]?.[columnIndex] ?? "")
  );
}

function resizeDraftVector(values: string[], size: number): string[] {
  return Array.from({ length: size }, (_, index) => values[index] ?? "");
}

function parseMatrixDraft(
  values: string[][],
  rows: number,
  columns: number
): { ok: true; value: MatrixData } | { ok: false; issue: ComputationIssue } {
  try {
    const parsed = values.map((row, rowIndex) =>
      row.map((value, columnIndex) => {
        const normalized = value.trim();
        if (normalized.length === 0) {
          throw {
            code: "matrix_input_required",
            message: "All matrix cells must contain a numeric value.",
            severity: "error",
            field: `values[${rowIndex}][${columnIndex}]`
          } satisfies ComputationIssue;
        }

        const numericValue = Number(normalized);
        if (!Number.isFinite(numericValue)) {
          throw {
            code: "matrix_invalid_value",
            message: "Matrix entries must parse as finite numbers.",
            severity: "error",
            field: `values[${rowIndex}][${columnIndex}]`
          } satisfies ComputationIssue;
        }

        return numericValue;
      })
    );

    return {
      ok: true,
      value: {
        rows,
        columns,
        values: parsed
      }
    };
  } catch (issue) {
    return {
      ok: false,
      issue: issue as ComputationIssue
    };
  }
}

function parseVectorDraft(
  values: string[],
  size: number
): { ok: true; value: number[] } | { ok: false; issue: ComputationIssue } {
  try {
    return {
      ok: true,
      value: values.slice(0, size).map((value, index) => {
        const normalized = value.trim();
        if (normalized.length === 0) {
          throw {
            code: "matrix_input_required",
            message: "All right-hand-side entries must contain a numeric value.",
            severity: "error",
            field: `rightHandSide[${index}]`
          } satisfies ComputationIssue;
        }

        const numericValue = Number(normalized);
        if (!Number.isFinite(numericValue)) {
          throw {
            code: "matrix_invalid_value",
            message: "Right-hand-side entries must parse as finite numbers.",
            severity: "error",
            field: `rightHandSide[${index}]`
          } satisfies ComputationIssue;
        }

        return numericValue;
      })
    };
  } catch (issue) {
    return {
      ok: false,
      issue: issue as ComputationIssue
    };
  }
}

function failEnvelope(
  settings: CalculatorSettings,
  issues: ComputationIssue[]
): ResultEnvelope<MatrixOperationResult | LinearSystemResult> {
  return {
    ok: false,
    issues,
    metadata: {
      backend: settings.numeric.backend
    }
  };
}

function toPersistedMatrix(values: string[][], rows: number, columns: number): MatrixData {
  return {
    rows,
    columns,
    values: values.slice(0, rows).map((row) =>
      Array.from({ length: columns }, (_, columnIndex) => {
        const rawValue = row?.[columnIndex]?.trim() ?? "";
        const parsedValue = Number(rawValue);
        return Number.isFinite(parsedValue) ? parsedValue : 0;
      })
    )
  };
}

function toPersistedMatrixOrNull(values: string[][], rows: number, columns: number): MatrixData | null {
  const parsedValues = values.slice(0, rows).map((row) =>
    Array.from({ length: columns }, (_, columnIndex) => {
      const rawValue = row?.[columnIndex]?.trim() ?? "";
      if (rawValue.length === 0) {
        return null;
      }

      const parsedValue = Number(rawValue);
      return Number.isFinite(parsedValue) ? parsedValue : null;
    })
  );

  if (parsedValues.some((row) => row.some((value) => value === null))) {
    return null;
  }

  return {
    rows,
    columns,
    values: parsedValues as number[][]
  };
}

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function withElapsedMetadata<T>(result: ResultEnvelope<T>, startedAt: number): ResultEnvelope<T> {
  return {
    ...result,
    metadata: {
      ...result.metadata,
      elapsedMs: Math.max(0, nowMs() - startedAt)
    }
  };
}

function formatCompact(value: number, precision = 8): string {
  if (!Number.isFinite(value)) {
    return value.toString();
  }

  const normalized = Object.is(value, -0) ? 0 : value;
  if (normalized === 0) {
    return "0";
  }

  return Number.parseFloat(normalized.toPrecision(Math.min(precision, 12))).toString();
}

function dimensionOptions() {
  return Array.from({ length: MAX_MATRIX_SIZE - 1 }, (_, index) => index + 2).map((value) => (
    <option key={value} value={value}>
      {value}
    </option>
  ));
}
