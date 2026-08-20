#!/usr/bin/env python3
"""Create and verify a Chrome Web Store upload ZIP from the built extension."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path, PurePosixPath
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
DEFAULT_OUTPUT_DIR = ROOT / "artifacts" / "chrome-web-store"

FORBIDDEN_DIRECTORIES = {
    ".git",
    "node_modules",
    "releases",
    "src",
}
FORBIDDEN_SUFFIXES = {
    ".crx",
    ".jks",
    ".key",
    ".keystore",
    ".map",
    ".p12",
    ".pem",
    ".pfx",
    ".zip",
}
MAX_CHROME_WEB_STORE_ZIP_BYTES = 2 * 1024 * 1024 * 1024
VERSION_PATTERN = re.compile(r"^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){0,3}$")
DYNAMIC_CODE_PATTERNS = (
    re.compile(r"\beval\s*\("),
    re.compile(r"\b(?:new\s+)?Function\s*\("),
)
PRIVATE_KEY_PATTERN = re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")


def fail(message: str) -> "NoReturn":
    raise SystemExit(f"Chrome Web Store package error: {message}")


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(f"cannot read valid JSON from {path}: {error}")


def validate_relative_name(name: str) -> None:
    path = PurePosixPath(name)
    lowered_parts = tuple(part.casefold() for part in path.parts)

    if path.is_absolute() or not path.parts or ".." in path.parts:
        fail(f"unsafe archive path: {name}")
    if any(part in FORBIDDEN_DIRECTORIES for part in lowered_parts):
        fail(f"forbidden project directory would be packaged: {name}")

    filename = path.name.casefold()
    if filename == ".env" or filename.startswith(".env."):
        fail(f"environment file would be packaged: {name}")
    if path.suffix.casefold() in FORBIDDEN_SUFFIXES:
        fail(f"forbidden release, secret, source-map, or nested archive file: {name}")


def collect_dist_files() -> list[tuple[Path, str]]:
    if not DIST.is_dir():
        fail(f"build output does not exist: {DIST}; run npm run build first")

    files: list[tuple[Path, str]] = []
    names_seen: set[str] = set()
    manifest_names: list[str] = []

    for path in DIST.rglob("*"):
        if path.is_symlink():
            fail(f"symbolic links are not allowed in the upload package: {path}")
        if not path.is_file():
            continue

        relative_name = path.relative_to(DIST).as_posix()
        validate_relative_name(relative_name)

        if path.suffix.casefold() in {".js", ".html"}:
            try:
                source = path.read_text(encoding="utf-8")
            except UnicodeDecodeError as error:
                fail(f"cannot scan UTF-8 source {relative_name}: {error}")
            if PRIVATE_KEY_PATTERN.search(source):
                fail(f"private key material found in {relative_name}")
            if path.suffix.casefold() == ".js" and any(
                pattern.search(source) for pattern in DYNAMIC_CODE_PATTERNS
            ):
                fail(f"dynamic code construction found in {relative_name}")
            if path.suffix.casefold() == ".html" and re.search(
                r"<script\b[^>]*\bsrc\s*=\s*['\"]https?://", source, re.IGNORECASE
            ):
                fail(f"remote script found in {relative_name}")

        folded_name = relative_name.casefold()
        if folded_name in names_seen:
            fail(f"case-insensitive duplicate archive path: {relative_name}")
        names_seen.add(folded_name)

        if PurePosixPath(relative_name).name.casefold() == "manifest.json":
            manifest_names.append(relative_name)
        files.append((path, relative_name))

    if manifest_names != ["manifest.json"]:
        fail(
            "dist must contain exactly one manifest.json at its root; "
            f"found {manifest_names or 'none'}"
        )
    if not files:
        fail("dist contains no files")

    files.sort(key=lambda item: (item[1] != "manifest.json", item[1].casefold()))
    return files


def create_archive(output: Path, files: list[tuple[Path, str]]) -> None:
    try:
        output.resolve().relative_to(DIST.resolve())
    except ValueError:
        pass
    else:
        fail("output ZIP must not be created inside dist")

    output.parent.mkdir(parents=True, exist_ok=True)
    output.unlink(missing_ok=True)

    with ZipFile(output, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for source, relative_name in files:
            info = ZipInfo(relative_name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, source.read_bytes())


def validate_archive(output: Path, expected_version: str) -> tuple[int, str]:
    if not output.is_file() or output.stat().st_size == 0:
        fail(f"archive was not created: {output}")
    if output.stat().st_size >= MAX_CHROME_WEB_STORE_ZIP_BYTES:
        fail("archive reaches or exceeds the Chrome Web Store 2 GB upload limit")

    with ZipFile(output, "r") as archive:
        names = archive.namelist()
        folded_names = [name.casefold() for name in names]
        if len(folded_names) != len(set(folded_names)):
            fail("archive contains duplicate paths")

        for name in names:
            validate_relative_name(name)

        manifests = [
            name
            for name in names
            if PurePosixPath(name).name.casefold() == "manifest.json"
        ]
        if manifests != ["manifest.json"]:
            fail(
                "archive must contain exactly one root manifest.json; "
                f"found {manifests or 'none'}"
            )
        if names[0] != "manifest.json":
            fail("manifest.json must be the first archive entry")

        corrupt_entry = archive.testzip()
        if corrupt_entry is not None:
            fail(f"archive CRC check failed at {corrupt_entry}")

        try:
            manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
        except (KeyError, UnicodeDecodeError, json.JSONDecodeError) as error:
            fail(f"archive manifest.json is invalid: {error}")

        if manifest.get("manifest_version") != 3:
            fail("archive manifest_version must be 3")
        if not VERSION_PATTERN.fullmatch(str(manifest.get("version", ""))):
            fail("archive manifest version is not a valid Chrome extension version")
        if manifest.get("version") != expected_version:
            fail(
                f"archive manifest version {manifest.get('version')!r} does not match "
                f"package version {expected_version!r}"
            )

    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    return len(names), digest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a Chrome Web Store ZIP whose root contains one manifest.json."
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional output ZIP path. Defaults to artifacts/chrome-web-store/.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    package_metadata = read_json(ROOT / "package.json")
    version = package_metadata.get("version")
    if not isinstance(version, str) or not version:
        fail("package.json has no valid version")
    if not VERSION_PATTERN.fullmatch(version):
        fail(f"package.json version is not valid for Chrome: {version!r}")

    dist_manifest = read_json(DIST / "manifest.json")
    if dist_manifest.get("version") != version:
        fail(
            f"dist manifest version {dist_manifest.get('version')!r} does not match "
            f"package version {version!r}; run npm run build first"
        )

    output = (
        args.output.resolve()
        if args.output
        else DEFAULT_OUTPUT_DIR
        / f"japanese-kanji-reading-assistant-{version}-chrome-web-store.zip"
    )
    files = collect_dist_files()
    create_archive(output, files)
    entry_count, digest = validate_archive(output, version)

    print("Chrome Web Store package validation passed.")
    print(f"Archive: {output}")
    print(f"Entries: {entry_count}")
    print("Manifest: manifest.json (single root manifest)")
    print(f"SHA-256: {digest}")


if __name__ == "__main__":
    main()
