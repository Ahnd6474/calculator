from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def test_matrix_modules_and_ui_exist() -> None:
    engine = REPO_ROOT / "src" / "core" / "matrix" / "engine.ts"
    service = REPO_ROOT / "src" / "services" / "matrix" / "service.ts"
    workbench = REPO_ROOT / "src" / "features" / "matrix" / "MatrixWorkbench.tsx"
    app = REPO_ROOT / "src" / "app" / "App.tsx"

    assert engine.exists()
    assert service.exists()
    assert workbench.exists()
    assert "MatrixWorkbench" in workbench.read_text(encoding="utf-8")
    assert "MatrixWorkbench" in app.read_text(encoding="utf-8")
