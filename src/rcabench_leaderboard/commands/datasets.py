from __future__ import annotations

import argparse

from ..config import load_config
from ..datasets import format_metadata, normalize_dataset
from ..download import download_dataset


def command_download(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    print(download_dataset(config, args.output))


def command_normalize(args: argparse.Namespace) -> None:
    config = load_config(args.config)
    metadata = normalize_dataset(
        config,
        args.config.resolve(),
        args.snapshot.resolve(),
        args.adapter,
    )
    print(format_metadata(metadata))
