import { useState } from "react";
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
import { createMatrixService } from "../../services/matrix";

type MatrixAction = MatrixOperation | "solve";

interface MatrixWorkbenchProps {
  settings: CalculatorSettings;
  initialDraft: MatrixDraft;
}

const matrixService = createMatrixService();

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

export function MatrixWorkbench({ settings, initialDraft }: MatrixWorkbenchProps) {
  const [action, setAction] = useState<MatrixAction>("solve");
  const [leftSize, setLeftSize] = useState({ rows: initialDraft.left.rows, columns: initialDraft.left.columns });
  const [rightSize, setRightSize] = useState({
    rows: initialDraft.right?.rows ?? initialDraft.left.rows,
    columns: initialDraft.right?.columns ?? initialDraft.left.columns
  });
  const [leftValues, setLeftValues] = useState(() => toDraftValues(initialDraft.left));
  const [rightValues, setRightValues] = useState(() => toDraftValues(initialDraft.right ?? initialDraft.left));
  const [rightHandSide, setRightHandSide] = useState(() => createVectorDraft(initialDraft.left.rows));
  const [result, setResult] = useState<ResultEnvelope<MatrixOperationResult | LinearSystemResult> | null>(null);

  const usesRightMatrix = binaryActions.includes(action);
  const usesRightHandSide = action === "solve";

  function updateLeftSize(nextRows: number, nextColumns: number) {
    setLeftSize({ rows: nextRows, columns: nextColumns });
    setLeftValues((current) => resizeDraftMatrix(current, nextRows, nextColumns));
    setRightHandSide((current) => resizeDraftVector(current, nextRows));
  }

  function updateRightSize(nextRows: number, nextColumns: number) {
    setRightSize({ rows: nextRows, columns: nextColumns });
    setRightValues((current) => resizeDraftMatrix(current, nextRows, nextColumns));
  }

  function submit() {
    if (action === "solve") {
      const coefficientMatrix = parseMatrixDraft(leftValues, leftSize.rows, leftSize.columns);
      const vector = parseVectorDraft(rightHandSide, leftSize.rows);

      if (!coefficientMatrix.ok) {
        setResult(failEnvelope(settings, [coefficientMatrix.issue]));
        return;
      }

      if (!vector.ok) {
        setResult(failEnvelope(settings, [vector.issue]));
        return;
      }

      void Promise.resolve(
        matrixService.solveLinearSystem({
          matrix: coefficientMatrix.value,
          rightHandSide: vector.value,
          settings
        })
      ).then((response) => setResult(response));
      return;
    }

    const leftMatrix = parseMatrixDraft(leftValues, leftSize.rows, leftSize.columns);
    if (!leftMatrix.ok) {
      setResult(failEnvelope(settings, [leftMatrix.issue]));
      return;
    }

    const rightMatrix = usesRightMatrix
      ? parseMatrixDraft(rightValues, rightSize.rows, rightSize.columns)
      : null;

    if (rightMatrix !== null && !rightMatrix.ok) {
      setResult(failEnvelope(settings, [rightMatrix.issue]));
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

    void Promise.resolve(matrixService.evaluate(request)).then((response) => setResult(response));
  }

  function resetDrafts() {
    setLeftSize({ rows: initialDraft.left.rows, columns: initialDraft.left.columns });
    setRightSize({
      rows: initialDraft.right?.rows ?? initialDraft.left.rows,
      columns: initialDraft.right?.columns ?? initialDraft.left.columns
    });
    setLeftValues(toDraftValues(initialDraft.left));
    setRightValues(toDraftValues(initialDraft.right ?? initialDraft.left));
    setRightHandSide(createVectorDraft(initialDraft.left.rows));
    setResult(null);
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
          onValuesChange={setLeftValues}
        />

        {usesRightMatrix ? (
          <MatrixEditor
            title="Right matrix B"
            size={rightSize}
            values={rightValues}
            onSizeChange={updateRightSize}
            onValuesChange={setRightValues}
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
