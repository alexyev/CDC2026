# Generated with Claude Code (Anthropic, Claude Opus 5.5) under the CDC2026 team's direction; see CITATIONS.md.

"""CLI: ``python -m analysis.schoolscape build [--dry-run]`` and ``python -m analysis.schoolscape check``.

``build`` runs each build module in config.OUTPUTS order.  ``--dry-run`` prints the planned outputs without writing.
``check`` rebuilds into a temporary directory and exits non-zero if any output differs from the committed files.
Both skip, with a notice on stderr, any build module whose owner task has not landed it yet.
``fixtures`` rebuilds the small app fixtures in site/src/test/fixtures/ (T0).
"""

import argparse
import importlib
import json
import sys
import tempfile
from pathlib import Path

from . import config


def plan() -> list[tuple[str, str, str]]:
    """(module, owner, output path relative to the repo root) for every planned output."""
    rows = []
    for module, owner, files in config.OUTPUTS:
        for path in files:
            rows.append((module, owner, str(path.relative_to(config.ROOT))))
    return rows


def print_plan() -> None:
    print(f"input: {config.INPUT_CSV.relative_to(config.ROOT)}")
    print(f"output directory: {config.OUT_DIR.relative_to(config.ROOT)}")
    print("planned outputs (module, owner, path):")
    for module, owner, path in plan():
        print(f"  {module:<11} {owner:<3} {path}")


def load_module(name: str):
    """The build module ``name``, or None while its owner task has not landed it yet."""
    try:
        return importlib.import_module(f"{__package__}.{name}")
    except ModuleNotFoundError as err:
        if err.name == f"{__package__}.{name}":
            owner = next(o for m, o, _ in config.OUTPUTS if m == name)
            print(f"skipped {name}: not implemented yet (owner: {owner})", file=sys.stderr)
            return None
        raise


def build(dry_run: bool) -> None:
    if dry_run:
        print_plan()
        print("dry run: nothing written")
        return
    for name, _owner, _files in config.OUTPUTS:
        module = load_module(name)
        if module is None:
            continue
        for path in module.build(dry_run=False):
            print(f"wrote {path.relative_to(config.ROOT)}")


def same_output(committed: Path, rebuilt: Path) -> bool:
    """Byte equality, except that meta.json's ``build`` timestamp is ignored."""
    if not committed.exists():
        return False
    if committed.name == "meta.json":
        a, b = json.loads(committed.read_text()), json.loads(rebuilt.read_text())
        a.pop("build", None)
        b.pop("build", None)
        return a == b
    return committed.read_bytes() == rebuilt.read_bytes()


def check() -> None:
    """Rebuilds every implemented module into a temporary directory and diffs it against the committed outputs."""
    out_dir, report_md = config.OUT_DIR, config.REPORT_MD
    differences = []
    with tempfile.TemporaryDirectory() as tmp:
        config.OUT_DIR, config.REPORT_MD = Path(tmp) / "data", Path(tmp) / "REPORT.md"
        try:
            for name, _owner, files in config.OUTPUTS:
                module = load_module(name)
                if module is None:
                    continue
                rebuilt = {Path(p) for p in module.build(dry_run=False)}
                for committed in files:
                    target = (config.REPORT_MD if committed == report_md
                              else config.OUT_DIR / committed.relative_to(out_dir))
                    if target not in rebuilt:
                        differences.append(f"{committed.relative_to(config.ROOT)}: not rebuilt by {name}")
                    elif not same_output(committed, target):
                        differences.append(f"{committed.relative_to(config.ROOT)}: differs from a fresh build")
                    else:
                        print(f"ok {committed.relative_to(config.ROOT)}")
        finally:
            config.OUT_DIR, config.REPORT_MD = out_dir, report_md
    if differences:
        print("\n".join(differences), file=sys.stderr)
        raise SystemExit(f"check failed: {len(differences)} output(s) differ; run `python -m analysis.schoolscape build`")
    print("check passed")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="python -m analysis.schoolscape", description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    p_build = sub.add_parser("build", help="build site/public/data/v1/")
    p_build.add_argument("--dry-run", action="store_true", help="print the planned outputs without writing")
    sub.add_parser("check", help="rebuild and diff against the committed outputs")
    sub.add_parser("fixtures", help="rebuild the app fixtures in site/src/test/fixtures/")
    args = parser.parse_args(argv)
    if args.command == "build":
        build(args.dry_run)
    elif args.command == "check":
        check()
    else:
        from . import fixtures

        for path in fixtures.build():
            print(f"wrote {path.relative_to(config.ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
