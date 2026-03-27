from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    executable = command[0]
    if sys.platform == "win32" and executable == "npm":
        command = ["npm.cmd", *command[1:]]

    return subprocess.run(
        command,
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def test_package_scripts_and_contract_docstring_exist() -> None:
    package_json = json.loads((REPO_ROOT / "package.json").read_text(encoding="utf-8"))
    scripts = package_json["scripts"]

    assert scripts["dev"] == "vite"
    assert scripts["typecheck"] == "tsc --noEmit"
    assert scripts["test:unit"] == "vitest run"

    contract_text = (REPO_ROOT / "src" / "core" / "contracts" / "index.ts").read_text(encoding="utf-8")
    expected = (
        "Shared computation contracts for the calculator. All feature UIs talk only to typed service "
        "interfaces defined here. Expression, matrix, solver, and numerical-analysis engines must remain "
        "pure modules with no React, persistence, or Tauri imports. Persisted settings and workspace state "
        "flow only through versioned schemas. New feature code may depend on settings, numeric backend, and "
        "result envelopes, but must not reach into sibling engine internals."
    )

    assert expected in contract_text


def test_versioned_schema_and_frontend_entrypoints_exist() -> None:
    schema_text = (REPO_ROOT / "src" / "persistence" / "schema.ts").read_text(encoding="utf-8")

    assert "SETTINGS_SCHEMA_VERSION = 1" in schema_text
    assert "WORKSPACE_SCHEMA_VERSION = 1" in schema_text
    assert (REPO_ROOT / "index.html").exists()
    assert (REPO_ROOT / "src" / "app" / "main.tsx").exists()
    assert (REPO_ROOT / "src-tauri" / "src" / "main.rs").exists()


def test_typecheck_and_vitest_pass() -> None:
    typecheck = run(["npm", "run", "typecheck"])
    if typecheck.returncode != 0:
        raise AssertionError(typecheck.stdout + "\n" + typecheck.stderr)

    unit = run(["npm", "run", "test:unit"])
    if unit.returncode != 0:
        raise AssertionError(unit.stdout + "\n" + unit.stderr)
