from __future__ import annotations

from pathlib import Path
from typing import Any

from ..config import manifest_path, read_manifest


def snapshot_cases(
    config: dict[str, Any], snapshot: Path, split: str, limit: int | None = None
) -> list[str]:
    cases = read_manifest(manifest_path(config, snapshot, split))
    expected = int(config["dataset"]["expected_cases"][split])
    if len(cases) != expected:
        raise ValueError(f"{split} manifest has {len(cases)} cases; expected {expected}")
    return cases[:limit] if limit else cases


def get_algorithm(config: dict[str, Any], name: str) -> dict[str, Any]:
    try:
        return config["algorithms"][name]
    except KeyError as exc:
        available = ", ".join(sorted(config["algorithms"]))
        raise ValueError(f"unknown algorithm {name!r}; available: {available}") from exc
