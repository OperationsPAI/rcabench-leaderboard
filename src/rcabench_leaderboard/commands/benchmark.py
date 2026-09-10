from __future__ import annotations

import argparse
import json
import sys

from ..config import dataset_path, load_config
from ..evaluation import evaluate, quality_gate_failures, write_metrics
from ..prepare import prepare_assets
from ..runner import run_benchmark
from .common import get_algorithm, snapshot_cases


def command_prepare(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    algorithm = get_algorithm(config, args.algorithm)
    if not algorithm.get("preparation"):
        print("none")
        return
    snapshot = args.snapshot.resolve()
    train_cases = snapshot_cases(config, snapshot, "train")
    test_cases = snapshot_cases(config, snapshot, "test")
    assets = prepare_assets(
        config=config,
        algorithm_name=args.algorithm,
        data_root=dataset_path(config, snapshot),
        train_cases=train_cases,
        test_cases=test_cases,
        cache_root=args.cache_root,
        repository_root=args.repository_root,
    )
    print(assets or "none")


def command_run(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    algorithm = get_algorithm(config, args.algorithm)
    snapshot = args.snapshot.resolve()
    split = args.split or algorithm["scope"]
    cases = snapshot_cases(config, snapshot, split, args.limit)
    state = run_benchmark(
        config=config,
        algorithm_name=args.algorithm,
        cases=cases,
        data_root=dataset_path(config, snapshot),
        output_root=args.output,
        container_runner=args.container_runner,
        assets=args.assets,
        workers=args.workers,
    )
    print(json.dumps(state, indent=2))
    if state["failed"]:
        raise SystemExit(2)


def command_evaluate(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    algorithm = get_algorithm(config, args.algorithm)
    snapshot = args.snapshot.resolve()
    split = args.split or algorithm["scope"]
    cases = snapshot_cases(config, snapshot, split, args.limit)
    deduplicate = config["benchmark"].get("deduplicate_services", True)
    if args.keep_duplicate_services:
        deduplicate = False
    metrics = evaluate(
        cases=cases,
        data_root=dataset_path(config, snapshot),
        results_root=args.results,
        deduplicate_services=deduplicate,
    )
    write_metrics(args.output, metrics)
    print(json.dumps(metrics, indent=2))
    max_algorithm_errors = int(algorithm.get("max_algorithm_errors", 0))
    failures = quality_gate_failures(metrics, max_algorithm_errors=max_algorithm_errors)
    if args.require_complete and failures:
        for failure in failures:
            print(f"quality gate failed: {failure}", file=sys.stderr)
        raise SystemExit(2)
