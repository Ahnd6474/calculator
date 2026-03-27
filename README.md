# Precision Scientific Calculator

A Vite + React + TypeScript calculator shell with a Tauri desktop wrapper. The app is aimed at practical engineering/scientific work: parsed expression evaluation, matrix operations, scalar root solving, numerical differentiation/integration, configurable precision settings, and persistent workspace state.

This is a real-valued numerical tool, not a symbolic CAS and not a firmware emulator.

## What It Does

- Evaluates parsed expressions with `+`, `-`, `*`, `/`, `^`, parentheses, unary signs, and scientific notation.
- Supports constants `pi` and `e`.
- Supports functions `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `sinh`, `cosh`, `tanh`, `exp`, `ln`, `log10`, `log`, `sqrt`, `cbrt`, `abs`, `floor`, `ceil`, and `round`.
- Runs with two numeric backends: `float64` and `decimal`.
- Persists settings, active workspace mode, matrix drafts, history, and memory registers in versioned local storage documents.
- Provides four product modes inside one shell:
  - Expression Engine
  - Matrix Lab
  - Root Solver
  - Numerical Tools

## Run It

```bash
npm install
npm run dev
```

Desktop shell:

```bash
npm run tauri:dev
```

Production build:

```bash
npm run build
```

## Test It

Unit/integration tests:

```bash
npm run test:unit
```

Repository verification command:

```bash
python -m pytest
```

`python -m pytest` also checks the TypeScript typecheck and the Vitest suite from the repository root.

## Product Flow

All four modes live inside the same app shell in [`src/app/App.tsx`](./src/app/App.tsx).

- Shared numerical settings apply across expression, matrix, solver, and numerical-tool modes.
- The right-side result panel shows the active mode summary using the same presentation contract.
- Any mode can store the current presentation into persistent history or a memory register.
- Matrix drafts now participate in the shared shell flow, so matrix dimensions/values survive mode switches and matrix results can be captured in history/memory like the other features.

## Architecture

The implementation is split by responsibility instead of putting math directly in React components.

- `src/core/contracts`
  - Shared typed contracts for requests, results, settings, and workspace state.
- `src/core/expression`
  - Tokenizer, parser, AST printer, and evaluator compiler. No `eval`.
- `src/core/precision`
  - Numeric runtime abstraction for `float64` and `decimal` backends plus display formatting.
- `src/core/matrix`
  - Matrix algorithms and diagnostics.
- `src/core/solver`
  - Scalar root-finding engine.
- `src/core/numerical`
  - Numerical differentiation and integration engine.
- `src/services/*`
  - Thin service adapters that normalize settings, choose the backend, and return `ResultEnvelope` objects.
- `src/persistence`
  - Versioned storage schemas and load/save logic.
- `src/features/*`
  - UI workbenches and feature-specific presentation helpers.

The intended dependency direction is:

`React UI -> services -> core engines/contracts`

Core engines do not import React, persistence, or Tauri code.

## Numerical Methods

### Expression Engine

- Tokenizes and parses user input into an AST.
- Compiles the AST against a numeric runtime.
- Applies angle mode to trig/inverse-trig functions.
- Supports equation-like solver input by rewriting `left = right` into `(left) - (right)` before solving.

### Precision Model

- `float64` backend
  - Native IEEE-754 `number` operations. Fastest, but subject to ordinary floating-point cancellation and rounding error.
- `decimal` backend
  - `decimal.js` runtime with configurable internal precision. Better for cancellation-sensitive calculations such as `(1e20 + 1) - 1e20`, but slower than `float64`.
- Display precision
  - User-facing output precision.
- Internal precision
  - Used by the decimal backend runtime.
- Display modes
  - `normal`, `scientific`, `engineering`.

User-facing settings are clamped to verified ranges:

- Display precision: `2` to `24`
- Internal precision: `16` to `128`
- Solver tolerance: `1e-15` to `1e-3`
- Max iterations: `5` to `1000`
- Angle mode: `radian` or `degree`

### Matrix Lab

- Practical matrix sizes: `2x2` through `6x6`
- Operations:
  - addition
  - subtraction
  - multiplication
  - transpose
  - determinant
  - inverse
  - solve `Ax = b`
- Determinant, inverse, and linear solve use LU-style elimination with partial pivoting.
- Condition estimates are surfaced when available.
- Singular or tolerance-singular matrices are blocked with explicit diagnostics.

### Root Solver

- One real variable only.
- Methods:
  - Newton-Raphson
  - Bisection
- Newton uses a numerical derivative estimated by central differencing around the current iterate.
- Bisection requires a valid sign-changing bracket.
- The solver records iteration history, residuals, step sizes, and termination reasons.

### Numerical Tools

- Differentiate a real-valued function of one variable at a point.
  - Central difference
  - Five-point stencil
- Integrate a real-valued function over an interval.
  - Composite trapezoidal rule
  - Composite Simpson rule
- Refinement continues until the estimated error meets the scaled tolerance target or the panel/iteration budget is exhausted.
- The tool surfaces warnings when derivatives look nonsmooth or integral refinement does not stabilize.

## Precision Limits And Practical Caveats

- This project is real-valued. Complex arithmetic is not implemented.
- The decimal backend improves many precision-sensitive cases, but it is still numerical computation, not exact symbolic math.
- Internal precision does not turn ill-conditioned problems into well-conditioned ones. Matrix condition warnings still matter.
- Newton-Raphson can stall when the derivative is near zero. That is reported as a non-convergent diagnostic, not silently ignored.
- Bisection only works when the interval brackets a sign change.
- Numerical differentiation near kinks or discontinuities is approximate and may emit reliability warnings.
- Numerical integration can stop at the configured panel budget before meeting tolerance.
- Matrix drafts persist through the shared workspace store, but the temporary `b` vector used for `Ax = b` solving is an in-session UI draft rather than a separately versioned persisted document.

## Automated Coverage

The repository includes:

- Expression-engine tests
- Precision/backend tests
- Matrix engine/service tests
- Solver tests
- Numerical-analysis tests
- Persistence tests
- An app-shell integration test covering cross-mode matrix persistence and shared history capture
- Python verification tests that run typecheck and the Vitest suite

## Non-Goals

- Symbolic algebra or simplification
- Graph plotting
- Complex numbers
- Units/dimensional analysis
- Large dense linear algebra beyond the `6x6` interactive work range
- Multi-variable or system root finding
- Special functions such as gamma, erf, or Bessel functions
- Financial spreadsheet workflows or arbitrary plugin execution
