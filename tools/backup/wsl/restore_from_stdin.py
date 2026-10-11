#!/usr/bin/env python3
"""Restore a streamed Restic dump into a new local Supabase lab database."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import unquote, urlsplit


LAB_PATH = Path("/home/tudor/.local/share/getflow-restore-lab")
SUPABASE_CLI = Path("/home/tudor/.local/bin/supabase-2.120.0")
LOCAL_HOST = "127.0.0.1"
LOCAL_PORT = 54322
TARGET_PATTERN = re.compile(
    r"^getflow_restore_(?:[a-f0-9]{8,64}|test_[a-f0-9]{12}_target)$"
)


class RestoreError(Exception):
    pass


def local_connection_environment() -> dict[str, str]:
    """Read only the isolated CLI's local DB URL; never print its credentials."""
    clean_env = {
        "HOME": "/home/tudor",
        "PATH": "/home/tudor/.local/bin:/usr/local/bin:/usr/bin:/bin",
        "SUPABASE_ACCESS_TOKEN": "",
        "SUPABASE_PROJECT_ID": "",
        "SUPABASE_DB_PASSWORD": "",
        "SUPABASE_DB_URL": "",
        "SUPABASE_URL": "",
        "SUPABASE_SERVICE_ROLE_KEY": "",
        "DATABASE_URL": "",
        "SUPABASE_TELEMETRY_DISABLED": "true",
    }
    completed = subprocess.run(
        [
            str(SUPABASE_CLI),
            "status",
            "--output-format",
            "json",
            "--workdir",
            str(LAB_PATH),
        ],
        cwd=LAB_PATH,
        env=clean_env,
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        raise RestoreError("Local Supabase status check failed.")

    try:
        status = json.loads(completed.stdout)
        identity = status["identity"]
        project_root = Path(identity["project_root"]).resolve()
        database_url = status["env"]["DB_URL"]
        parsed = urlsplit(database_url)
    except (KeyError, TypeError, ValueError, json.JSONDecodeError):
        raise RestoreError("Local Supabase status was not usable.") from None

    if project_root != LAB_PATH.resolve():
        raise RestoreError("Supabase CLI resolved an unexpected local project.")
    if (
        parsed.scheme not in ("postgres", "postgresql")
        or parsed.hostname != LOCAL_HOST
        or parsed.port != LOCAL_PORT
        or parsed.path != "/postgres"
        or unquote(parsed.username or "") != "postgres"
        or not parsed.password
    ):
        raise RestoreError("Supabase CLI did not resolve the isolated loopback database.")

    return {
        "PGHOST": LOCAL_HOST,
        "PGPORT": str(LOCAL_PORT),
        "PGUSER": "postgres",
        "PGPASSWORD": unquote(parsed.password),
        "PGSSLMODE": "disable",
        "PGCONNECT_TIMEOUT": "5",
        "PGDATABASE": "postgres",
    }


def run_restore(target_database: str) -> int:
    if not TARGET_PATTERN.fullmatch(target_database):
        raise RestoreError("Restore target is not a disposable GetFlow validation database.")

    connection_env = local_connection_environment()
    create_database = subprocess.run(
        [
            "createdb",
            "--no-password",
            "--host",
            LOCAL_HOST,
            "--port",
            str(LOCAL_PORT),
            "--username",
            "postgres",
            "--maintenance-db",
            "postgres",
            "--template",
            "template0",
            target_database,
        ],
        env=connection_env,
        check=False,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if create_database.returncode != 0:
        raise RestoreError("Restore target could not be created without overwriting data.")

    target_env = dict(connection_env)
    target_env["PGDATABASE"] = target_database
    clear_default_public = subprocess.run(
        [
            "psql",
            "-X",
            "-q",
            "-v",
            "ON_ERROR_STOP=1",
            "--no-password",
            "--dbname",
            target_database,
            "-c",
            "DROP SCHEMA IF EXISTS public CASCADE;",
        ],
        env=target_env,
        check=False,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if clear_default_public.returncode != 0:
        raise RestoreError("New isolated target could not be prepared for archive restoration.")

    restore_env = dict(connection_env)
    restore_env["PGDATABASE"] = target_database
    restored = subprocess.run(
        [
            "pg_restore",
            "--exit-on-error",
            "--no-owner",
            "--no-privileges",
            "--dbname",
            target_database,
        ],
        env=restore_env,
        check=False,
        stdin=sys.stdin.buffer,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if restored.returncode != 0:
        print(f"RESTORE_FAILED: pg_restore exit {restored.returncode}")
        return restored.returncode or 1

    print("ISOLATED_RESTORE: PASS")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)
    restore_parser = subparsers.add_parser("restore")
    restore_parser.add_argument("--target-database", required=True)
    args = parser.parse_args()

    try:
        return run_restore(args.target_database)
    except RestoreError as error:
        print(f"ISOLATED_RESTORE: BLOCKED ({error})")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
