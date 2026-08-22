#!/usr/bin/env python3
"""Create and verify the versioned ZIP linked from the documentation site."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path, PurePosixPath
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
DOWNLOADS = ROOT / "docs" / "downloads"
BLOCKED_SUFFIXES = {".crx", ".jks", ".key", ".keystore", ".map", ".p12", ".pem", ".pfx", ".zip"}


def fail(message: str) -> "NoReturn":
    raise SystemExit(f"Documentation download package error: {message}")


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"cannot read valid JSON from {path}: {error}")


def collect_dist_files() -> list[tuple[Path, str]]:
    if not DIST.is_dir():
        fail(f"build output does not exist: {DIST}; run npm run build first")

    files: list[tuple[Path, str]] = []
    folded_names: set[str] = set()
    for path in DIST.rglob("*"):
        if path.is_symlink():
            fail(f"symbolic links are not allowed: {path}")
        if not path.is_file():
            continue
        relative_name = path.relative_to(DIST).as_posix()
        relative_path = PurePosixPath(relative_name)
        if relative_path.is_absolute() or ".." in relative_path.parts:
            fail(f"unsafe archive path: {relative_name}")
        if relative_path.suffix.casefold() in BLOCKED_SUFFIXES:
            fail(f"forbidden release, secret, source-map, or nested archive: {relative_name}")
        folded_name = relative_name.casefold()
        if folded_name in folded_names:
            fail(f"case-insensitive duplicate archive path: {relative_name}")
        folded_names.add(folded_name)
        files.append((path, relative_name))

    files.sort(key=lambda item: (item[1] != "manifest.json", item[1].casefold()))
    manifests = [name for _, name in files if PurePosixPath(name).name.casefold() == "manifest.json"]
    if manifests != ["manifest.json"]:
        fail(f"dist must contain exactly one root manifest.json; found {manifests or 'none'}")
    return files


def create_archive(output: Path, prefix: str, files: list[tuple[Path, str]]) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.unlink(missing_ok=True)
    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for source, relative_name in files:
            archive_name = f"{prefix}/{relative_name}"
            info = ZipInfo(archive_name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, source.read_bytes())


def validate_archive(output: Path, prefix: str, version: str, expected_files: set[str]) -> tuple[int, str]:
    if not output.is_file() or output.stat().st_size == 0:
        fail(f"archive was not created: {output}")

    with ZipFile(output, "r") as archive:
        names = archive.namelist()
        if len(names) != len(set(name.casefold() for name in names)):
            fail("archive contains duplicate paths")
        expected_names = {f"{prefix}/{name}" for name in expected_files}
        if set(names) != expected_names:
            missing = sorted(expected_names - set(names))
            extra = sorted(set(names) - expected_names)
            fail(f"archive file set differs from dist; missing={missing}, extra={extra}")
        if {PurePosixPath(name).parts[0] for name in names} != {prefix}:
            fail("archive must contain exactly one versioned top-level directory")
        manifests = [name for name in names if PurePosixPath(name).name.casefold() == "manifest.json"]
        expected_manifest = f"{prefix}/manifest.json"
        if manifests != [expected_manifest] or names[0] != expected_manifest:
            fail(f"archive must contain one manifest first at {expected_manifest}")
        corrupt_entry = archive.testzip()
        if corrupt_entry is not None:
            fail(f"archive CRC check failed at {corrupt_entry}")
        manifest = json.loads(archive.read(expected_manifest).decode("utf-8"))
        if manifest.get("manifest_version") != 3 or manifest.get("version") != version:
            fail("archive manifest does not match the current Manifest V3 package version")

    return len(names), hashlib.sha256(output.read_bytes()).hexdigest().upper()


def main() -> None:
    package_metadata = read_json(ROOT / "package.json")
    version = package_metadata.get("version")
    if not isinstance(version, str) or not version:
        fail("package.json has no valid version")
    dist_manifest = read_json(DIST / "manifest.json")
    if dist_manifest.get("version") != version:
        fail(f"dist manifest version does not match package version {version}; run npm run build first")

    prefix = f"japanese-furigana-ai-{version}"
    output = DOWNLOADS / f"{prefix}.zip"
    files = collect_dist_files()
    create_archive(output, prefix, files)
    entry_count, digest = validate_archive(
        output,
        prefix,
        version,
        {relative_name for _, relative_name in files},
    )

    print("Documentation download package validation passed.")
    print(f"Archive: {output}")
    print(f"Entries: {entry_count}")
    print(f"Top-level directory: {prefix}/")
    print(f"Size: {output.stat().st_size} bytes ({output.stat().st_size / 1024 / 1024:.1f} MiB)")
    print(f"SHA-256: {digest}")


if __name__ == "__main__":
    main()
