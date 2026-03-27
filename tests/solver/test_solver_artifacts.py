from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_solver_modules_and_ui_exist() -> None:
    engine = REPO_ROOT / "src" / "core" / "solver" / "engine.ts"
    service = REPO_ROOT / "src" / "services" / "solver" / "service.ts"
    workbench = REPO_ROOT / "src" / "features" / "solver" / "SolverWorkbench.tsx"
    app = REPO_ROOT / "src" / "app" / "App.tsx"

    assert engine.exists()
    assert service.exists()
    assert workbench.exists()
    assert "SolverWorkbench" in workbench.read_text(encoding="utf-8")
    assert "SolverWorkbench" in app.read_text(encoding="utf-8")
