"""CLI: ``python -m analysis.schoolscape build [--dry-run]`` and ``python -m analysis.schoolscape check``.

``build`` runs each build module in config.OUTPUTS order.  ``--dry-run`` prints the planned outputs without writing.
``check`` rebuilds into a temporary directory and exits non-zero if any output differs from the committed files.
``fixtures`` rebuilds the small app fixtures in site/src/test/fixtures/ (T0).
"""

import argparse
import importlib
import sys

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
    try:
        return importlib.import_module(f"{__package__}.{name}")
    except ModuleNotFoundError as err:
        if err.name == f"{__package__}.{name}":
            owner = next(o for m, o, _ in config.OUTPUTS if m == name)
            raise SystemExit(f"{name}.py is not implemented yet (owner: {owner})") from None
        raise


def build(dry_run: bool) -> None:
    if dry_run:
        print_plan()
        print("dry run: nothing written")
        return
    for name, _owner, _files in config.OUTPUTS:
        written = load_module(name).build(dry_run=False)
        for path in written:
            print(f"wrote {path.relative_to(config.ROOT)}")


def check() -> None:
    raise SystemExit("check is not implemented yet (owner: P2; SPEC.md 8.3)")


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
