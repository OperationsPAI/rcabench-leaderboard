from __future__ import annotations

import argparse
import json

from ..config import load_config
from ..records import build_site, record_metrics
from .common import get_algorithm


def command_record(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    get_algorithm(config, args.algorithm)
    entry = record_metrics(
        leaderboard_path=args.leaderboard,
        metrics_path=args.metrics,
        config=config,
        algorithm_name=args.algorithm,
        run_id=args.run_id,
    )
    if args.archive:
        args.archive.parent.mkdir(parents=True, exist_ok=True)
        args.archive.write_text(json.dumps(entry, indent=2) + "\n")
    print(json.dumps(entry, indent=2))


def command_build_site(args: argparse.Namespace) -> None:
    print(build_site(leaderboard_path=args.leaderboard, site_dir=args.site_dir))
