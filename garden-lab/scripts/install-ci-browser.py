#!/usr/bin/env python3
"""Install Playwright normally while isolating one unrelated hosted-runner feed."""
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

INSTALL_COMMAND = ["npx", "--no-install", "playwright", "install", "--with-deps", "chromium"]


def source_uris(text, suffix):
    """Read only understood active APT entries; unknown/mixed syntax stays put.

    Formats: https://manpages.debian.org/bookworm/apt/sources.list.5.en.html
    Microsoft's documented file is microsoft-prod.list, but identify its URI
    so an equivalent .sources file or another filename also works.
    """
    if suffix == ".list":
        entries = [line.split("#", 1)[0].strip() for line in text.splitlines()]
        entries = [line for line in entries if line]
        matches = [re.fullmatch(r"deb(?:-src)?\s+(?:\[[^\]]*\]\s+)?(\S+)\s+.+", line) for line in entries]
        return [match[1] for match in matches] if all(matches) else None
    uris = []
    for stanza in re.split(r"\n\s*\n", text):
        fields, previous = {}, None
        for line in stanza.splitlines():
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            if line[0].isspace() and previous:
                fields[previous] += " " + line.strip()
            elif ":" in line:
                key, value = line.split(":", 1)
                previous = key.strip().lower()
                if previous in fields:
                    return None
                fields[previous] = value.strip()
            else:
                return None
        if not fields or fields.get("enabled", "yes").lower() == "no":
            continue
        if not fields.get("uris") or not fields.get("types") or not set(fields["types"].split()).issubset({"deb", "deb-src"}):
            return None
        uris.extend(fields["uris"].split())
    return uris


def microsoft_prod_only(path):
    uris = source_uris(path.read_text(), path.suffix)
    if not uris:
        return False
    for uri in uris:
        parsed = urlsplit(uri)
        if parsed.scheme not in {"http", "https"} or parsed.hostname != "packages.microsoft.com" or parsed.path.rstrip("/") != "/ubuntu/24.04/prod":
            return False
    return True


def install_browser(source_dir=Path("/etc/apt/sources.list.d"), *, environ=None, run=subprocess.run):
    environ = os.environ if environ is None else environ
    sources = []
    if environ.get("GITHUB_ACTIONS") == "true" and sys.platform == "linux" and source_dir.is_dir():
        sources = [p for p in sorted(source_dir.iterdir()) if p.suffix in {".list", ".sources"} and p.is_file() and microsoft_prod_only(p)]
    backup_dir, moved = None, []
    try:
        if sources:
            backup_dir = Path(tempfile.mkdtemp(prefix="garden-browser-apt-"))
            for source in sources:
                backup = backup_dir / source.name
                moved.append((source, backup))
                run(["sudo", "mv", "--", str(source), str(backup)], check=True)
                print("Temporarily isolated Microsoft Ubuntu prod source: " + str(source), flush=True)
        result = run(INSTALL_COMMAND, check=False)
        return result.returncode if result.returncode >= 0 else 128 - result.returncode
    finally:
        failures = []
        for source, backup in reversed(moved):
            if backup.exists() or backup.is_symlink():
                try:
                    run(["sudo", "mv", "--", str(backup), str(source)], check=True)
                    print("Restored APT source: " + str(source), flush=True)
                except Exception as error:
                    failures.append(error)
        if failures:
            # Retain original backups if restoration itself fails.
            raise RuntimeError("Could not restore APT source; originals retained in " + str(backup_dir)) from failures[0]
        if backup_dir:
            backup_dir.rmdir()


if __name__ == "__main__":
    # SystemExit also runs the restoration finally block on CI cancellation.
    for signum in (signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, lambda received, _frame: sys.exit(128 + received))
    sys.exit(install_browser())
