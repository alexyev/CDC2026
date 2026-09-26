"""Cached, SHA-256-verified downloads into .cache/schoolscape/ (SPEC.md 8.1)."""

import hashlib
import sys
import urllib.request
import zipfile
from pathlib import Path

from . import config


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch(key: str) -> Path:
    """Returns the local path of download ``key`` from config.DOWNLOADS, downloading it once; fails on a hash mismatch."""
    spec = config.DOWNLOADS[key]
    url, expected = spec["url"], spec["sha256"]
    path = config.CACHE_DIR / url.rsplit("/", 1)[-1]
    if not path.exists():
        config.CACHE_DIR.mkdir(parents=True, exist_ok=True)
        print(f"downloading {url}", file=sys.stderr)
        tmp = path.with_suffix(path.suffix + ".part")
        with urllib.request.urlopen(url, timeout=120) as res, tmp.open("wb") as out:
            while chunk := res.read(1 << 20):
                out.write(chunk)
        tmp.rename(path)
    actual = sha256(path)
    if actual != expected:
        raise SystemExit(f"SHA-256 mismatch for {path.name}: expected {expected}, got {actual}")
    return path


def extract(key: str) -> Path:
    """Downloads ``key`` and unzips it next to the archive; returns the extraction directory."""
    archive = fetch(key)
    target = archive.with_suffix("")
    if not target.exists():
        with zipfile.ZipFile(archive) as z:
            z.extractall(target)
    return target
