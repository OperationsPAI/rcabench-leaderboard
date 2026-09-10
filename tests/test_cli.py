import json
from pathlib import Path

import pytest

from rcabench_leaderboard import cli
from rcabench_leaderboard.commands import benchmark, checks, datasets, publishing
from rcabench_leaderboard.commands.common import get_algorithm, snapshot_cases


@pytest.mark.parametrize(
    ("arguments", "handler"),
    [
        (["validate"], checks.command_validate),
        (["validate-registry"], checks.command_validate_registry),
        (["doctor"], checks.command_doctor),
        (["download", "--output", "snapshot"], datasets.command_download),
        (
            ["normalize", "--snapshot", "snapshot", "--adapter", "native"],
            datasets.command_normalize,
        ),
        (["normalize-ops-lite", "--snapshot", "snapshot"], datasets.command_normalize),
        (["prepare", "art", "--snapshot", "snapshot"], benchmark.command_prepare),
        (["run", "baro", "--snapshot", "snapshot", "--output", "results"], benchmark.command_run),
        (
            [
                "evaluate",
                "baro",
                "--snapshot",
                "snapshot",
                "--results",
                "results",
                "--output",
                "metrics.json",
            ],
            benchmark.command_evaluate,
        ),
        (
            ["record", "baro", "--metrics", "metrics.json", "--run-id", "run"],
            publishing.command_record,
        ),
        (["build-site"], publishing.command_build_site),
    ],
)
def test_public_commands_keep_their_handlers_and_defaults(arguments, handler):
    args = cli.build_parser().parse_args(arguments)
    assert args.function is handler
    if hasattr(args, "config"):
        assert args.config == Path("config/benchmark.json")
    if arguments[0] == "normalize-ops-lite":
        assert args.adapter == "ops-lite"
    if arguments[0] == "run":
        assert args.workers is None
        assert args.split is None
        assert args.container_runner == Path("containers/run_algorithm.py")


def test_snapshot_validates_full_manifest_before_applying_limit(tmp_path):
    (tmp_path / "test.txt").write_text("case-a\ncase-b\n")
    config = {"dataset": {"manifests": {"test": "test.txt"}, "expected_cases": {"test": 2}}}
    assert snapshot_cases(config, tmp_path, "test", 1) == ["case-a"]
    config["dataset"]["expected_cases"]["test"] = 3
    with pytest.raises(ValueError, match="2 cases; expected 3"):
        snapshot_cases(config, tmp_path, "test", 1)


def test_unknown_algorithm_keeps_actionable_error():
    with pytest.raises(ValueError, match="available: art, baro"):
        get_algorithm({"algorithms": {"baro": {}, "art": {}}}, "unknown")


@pytest.fixture
def benchmark_config(tmp_path, monkeypatch):
    (tmp_path / "all.txt").write_text("case-a\ncase-b\n")
    config = {
        "benchmark": {"deduplicate_services": True},
        "dataset": {"manifests": {"all": "all.txt"}, "expected_cases": {"all": 2}},
        "algorithms": {"baro": {"scope": "all", "max_algorithm_errors": 0}},
    }
    monkeypatch.setattr(benchmark, "load_config", lambda _: config)
    return config


@pytest.mark.parametrize("failed", [0, 1])
def test_run_preserves_case_selection_options_and_exit_status(
    tmp_path, monkeypatch, capsys, benchmark_config, failed
):
    calls = []

    def run(**kwargs):
        calls.append(kwargs)
        return {"failed": failed}

    monkeypatch.setattr(benchmark, "run_benchmark", run)
    args = cli.build_parser().parse_args(
        [
            "run",
            "baro",
            "--snapshot",
            str(tmp_path),
            "--output",
            str(tmp_path / "results"),
            "--limit",
            "1",
            "--workers",
            "2",
        ]
    )
    if failed:
        with pytest.raises(SystemExit) as caught:
            args.function(args)
        assert caught.value.code == 2
    else:
        args.function(args)
    assert calls[0]["cases"] == ["case-a"]
    assert calls[0]["workers"] == 2
    assert calls[0]["data_root"] == tmp_path
    assert json.loads(capsys.readouterr().out) == {"failed": failed}


@pytest.mark.parametrize("require_complete", [False, True])
def test_evaluate_writes_diagnostics_before_enforcing_quality_gate(
    tmp_path, monkeypatch, capsys, benchmark_config, require_complete
):
    metrics = {
        "requested_cases": 2,
        "missing_cases": 1,
        "invalid_cases": 0,
        "algorithm_error_cases": 0,
        "non_empty_ranking_cases": 1,
        "top@5": 0.5,
    }
    calls = []

    def evaluate(**kwargs):
        calls.append(kwargs)
        return metrics

    monkeypatch.setattr(benchmark, "evaluate", evaluate)
    output = tmp_path / "metrics.json"
    arguments = [
        "evaluate",
        "baro",
        "--snapshot",
        str(tmp_path),
        "--results",
        str(tmp_path),
        "--output",
        str(output),
        "--keep-duplicate-services",
    ]
    if require_complete:
        arguments.append("--require-complete")
    args = cli.build_parser().parse_args(arguments)
    if require_complete:
        with pytest.raises(SystemExit) as caught:
            args.function(args)
        assert caught.value.code == 2
    else:
        args.function(args)
    assert json.loads(output.read_text()) == metrics
    assert calls[0]["cases"] == ["case-a", "case-b"]
    assert calls[0]["deduplicate_services"] is False
    assert ("quality gate failed" in capsys.readouterr().err) is require_complete


def test_main_keeps_error_exit_contract(monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["rcabench-leaderboard", "validate"])

    def missing_config(_):
        raise FileNotFoundError("missing config")

    monkeypatch.setattr(checks, "load_config", missing_config)
    with pytest.raises(SystemExit) as caught:
        cli.main()
    assert caught.value.code == 2
    assert capsys.readouterr().err == "error: missing config\n"


def test_build_site_preserves_source_bytes_and_frontend_assets(tmp_path, capsys):
    source = tmp_path / "leaderboard.json"
    contents = '{"schema_version": 2, "benchmarks": []}\n'
    source.write_text(contents)
    site = tmp_path / "site"
    site.mkdir()
    (site / "app.js").write_text("// preserved module\n")
    args = cli.build_parser().parse_args(
        [
            "build-site",
            "--leaderboard",
            str(source),
            "--site-dir",
            str(site),
        ]
    )
    args.function(args)
    assert (site / "data.json").read_text() == contents
    assert source.read_text() == contents
    assert (site / "app.js").read_text() == "// preserved module\n"
    assert capsys.readouterr().out.strip() == str(site / "data.json")
