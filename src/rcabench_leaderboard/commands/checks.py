from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess

from ..config import load_config, load_dataset_registry, load_registered_configs


def command_validate(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    print(
        json.dumps(
            {
                "status": "valid",
                "benchmark": config["benchmark"]["id"],
                "dataset": config["dataset"]["repo_id"],
                "algorithms": sorted(config["algorithms"]),
            },
            indent=2,
        )
    )


def command_validate_registry(args: argparse.Namespace) -> None:
    registry = load_dataset_registry(args.registry)
    configs = load_registered_configs(args.registry)
    print(
        json.dumps(
            {
                "status": "valid",
                "datasets": [
                    {
                        "name": name,
                        "adapter": registry["datasets"][name]["adapter"],
                        "benchmark": configs[name]["benchmark"]["id"],
                    }
                    for name in sorted(configs)
                ],
            },
            indent=2,
        )
    )


def command_doctor(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    checks = {
        "docker_cli": shutil.which("docker") is not None,
        "docker_daemon": False,
        "config": True,
        "hf_token": bool(os.getenv("HF_TOKEN")),
    }
    if checks["docker_cli"]:
        checks["docker_daemon"] = (
            subprocess.run(
                ["docker", "info"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            ).returncode
            == 0
        )
    checks["algorithms"] = sorted(config["algorithms"])
    print(json.dumps(checks, indent=2))
    if not checks["docker_daemon"]:
        raise SystemExit(2)
