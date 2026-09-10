from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .commands.benchmark import command_evaluate, command_prepare, command_run
from .commands.checks import command_doctor, command_validate, command_validate_registry
from .commands.datasets import command_download, command_normalize
from .commands.publishing import command_build_site, command_record
from .config import SUPPORTED_DATASET_ADAPTERS


def _common_config(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--config", type=Path, default=Path("config/benchmark.json"))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="rcabench-leaderboard")
    subparsers = parser.add_subparsers(required=True)

    validate = subparsers.add_parser("validate", help="validate benchmark configuration")
    _common_config(validate)
    validate.set_defaults(function=command_validate)

    validate_registry = subparsers.add_parser(
        "validate-registry", help="validate every registered dataset configuration"
    )
    validate_registry.add_argument(
        "--registry", type=Path, default=Path("config/datasets.json")
    )
    validate_registry.set_defaults(function=command_validate_registry)

    doctor = subparsers.add_parser("doctor", help="check the local execution environment")
    _common_config(doctor)
    doctor.set_defaults(function=command_doctor)

    download = subparsers.add_parser("download", help="download the pinned Hugging Face data")
    _common_config(download)
    download.add_argument("--output", type=Path, required=True)
    download.set_defaults(function=command_download)

    normalize = subparsers.add_parser("normalize", help="prepare a registered dataset adapter")
    _common_config(normalize)
    normalize.add_argument("--snapshot", type=Path, required=True)
    normalize.add_argument("--adapter", choices=sorted(SUPPORTED_DATASET_ADAPTERS), required=True)
    normalize.set_defaults(function=command_normalize)

    legacy_normalize = subparsers.add_parser(
        "normalize-ops-lite", help="deprecated alias for normalize --adapter ops-lite"
    )
    _common_config(legacy_normalize)
    legacy_normalize.add_argument("--snapshot", type=Path, required=True)
    legacy_normalize.set_defaults(function=command_normalize, adapter="ops-lite")

    prepare = subparsers.add_parser("prepare", help="train/cache ART or Eadro assets")
    _common_config(prepare)
    prepare.add_argument("algorithm")
    prepare.add_argument("--snapshot", type=Path, required=True)
    prepare.add_argument("--cache-root", type=Path, default=Path(".cache"))
    prepare.add_argument("--repository-root", type=Path, default=Path.cwd())
    prepare.set_defaults(function=command_prepare)

    run = subparsers.add_parser("run", help="run an algorithm over a manifest")
    _common_config(run)
    run.add_argument("algorithm")
    run.add_argument("--snapshot", type=Path, required=True)
    run.add_argument("--output", type=Path, required=True)
    run.add_argument("--container-runner", type=Path, default=Path("containers/run_algorithm.py"))
    run.add_argument("--assets", type=Path)
    run.add_argument("--split", choices=("all", "train", "test"))
    run.add_argument("--limit", type=int)
    run.add_argument("--workers", type=int)
    run.set_defaults(function=command_run)

    evaluation = subparsers.add_parser("evaluate", help="calculate canonical ranking metrics")
    _common_config(evaluation)
    evaluation.add_argument("algorithm")
    evaluation.add_argument("--snapshot", type=Path, required=True)
    evaluation.add_argument("--results", type=Path, required=True)
    evaluation.add_argument("--output", type=Path, required=True)
    evaluation.add_argument("--split", choices=("all", "train", "test"))
    evaluation.add_argument("--limit", type=int)
    evaluation.add_argument("--keep-duplicate-services", action="store_true")
    evaluation.add_argument("--require-complete", action="store_true")
    evaluation.set_defaults(function=command_evaluate)

    record = subparsers.add_parser("record", help="promote metrics to the leaderboard")
    _common_config(record)
    record.add_argument("algorithm")
    record.add_argument("--metrics", type=Path, required=True)
    record.add_argument("--leaderboard", type=Path, default=Path("results/leaderboard.json"))
    record.add_argument("--run-id", required=True)
    record.add_argument("--archive", type=Path)
    record.set_defaults(function=command_record)

    site = subparsers.add_parser("build-site", help="copy validated data into the static site")
    site.add_argument("--leaderboard", type=Path, default=Path("results/leaderboard.json"))
    site.add_argument("--site-dir", type=Path, default=Path("site"))
    site.set_defaults(function=command_build_site)
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    try:
        args.function(args)
    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc


if __name__ == "__main__":
    main()
