from __future__ import annotations

import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "scripts" / "bizspec.py"


def run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(CLI), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def test_init_validate_status_and_next(tmp_path: Path) -> None:
    project = tmp_path / "example"

    initialized = run_cli(
        "init",
        str(project),
        "--id",
        "example",
        "--title",
        "示例业务系统",
    )
    assert initialized.returncode == 0, initialized.stderr
    assert (project / "manifest.yaml").exists()
    assert len(list((project / "nodes").glob("BS-*.md"))) == 12

    validated = run_cli("validate", str(project))
    assert validated.returncode == 0, validated.stdout + validated.stderr
    assert "Validation passed" in validated.stdout

    status = run_cli("status", str(project))
    assert status.returncode == 0, status.stderr
    assert "BS-01" in status.stdout
    assert "项目范围与业务目标" in status.stdout

    next_node = run_cli("next", str(project))
    assert next_node.returncode == 0, next_node.stdout + next_node.stderr
    assert "BS-01 项目范围与业务目标" in next_node.stdout


def test_done_requires_completion_gates(tmp_path: Path) -> None:
    project = tmp_path / "example"
    initialized = run_cli(
        "init",
        str(project),
        "--id",
        "example",
        "--title",
        "示例业务系统",
    )
    assert initialized.returncode == 0, initialized.stderr

    completed = run_cli(
        "set-status",
        str(project),
        "BS-01",
        "done",
        "--by",
        "tester",
        "--reason",
        "attempt premature completion",
    )
    assert completed.returncode == 1
    assert "Cannot mark node as done" in completed.stderr
