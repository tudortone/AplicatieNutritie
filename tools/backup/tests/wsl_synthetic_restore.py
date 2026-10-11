#!/usr/bin/env python3
"""Disposable WSL-only database fixtures for backup restore integration tests."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "wsl"))
from restore_from_stdin import local_connection_environment  # noqa: E402


APPROVED_SCHEMAS = {
    "auth",
    "cron",
    "extensions",
    "graphql",
    "graphql_public",
    "public",
    "realtime",
    "storage",
    "supabase_migrations",
}
TOKEN_PATTERN = re.compile(r"^[a-f0-9]{12}$")
SOURCE_PATTERN = re.compile(r"^getflow_restore_test_[a-f0-9]{12}_src$")
TARGET_PATTERN = re.compile(r"^getflow_restore_test_[a-f0-9]{12}_target$")


def require_token(token: str) -> None:
    if not TOKEN_PATTERN.fullmatch(token):
        raise ValueError("Synthetic fixture token is invalid.")


def run(args: list[str], env: dict[str, str], *, stdin=None, stdout=None) -> int:
    result = subprocess.run(
        args,
        env=env,
        check=False,
        stdin=stdin,
        stdout=stdout,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode


def setup_with_sql(source_database: str, token: str) -> int:
    """Create a source DB and write literal synthetic rows using psql stdin."""
    require_token(token)
    if not SOURCE_PATTERN.fullmatch(source_database):
        raise ValueError("Synthetic source database name is invalid.")
    env = local_connection_environment()
    created = run(
        [
            "createdb",
            "--no-password",
            "--host",
            "127.0.0.1",
            "--port",
            "54322",
            "--username",
            "postgres",
            "--maintenance-db",
            "postgres",
            "--template",
            "template0",
            source_database,
        ],
        env,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
    )
    if created != 0:
        raise RuntimeError("Dedicated synthetic source database was not created.")

    sql = "\n".join(
        f'CREATE SCHEMA "{schema}";'
        for schema in sorted(APPROVED_SCHEMAS - {"public"})
    )
    sql += f"""
CREATE TABLE public.getflow_backup_probe_{token} (
    id integer PRIMARY KEY,
    marker text NOT NULL
);
INSERT INTO public.getflow_backup_probe_{token} VALUES (1, 'GETFLOW_SYNTHETIC_RESTORED');
CREATE SCHEMA vault;
CREATE TABLE vault.secret_probe_{token} (value text NOT NULL);
INSERT INTO vault.secret_probe_{token} VALUES ('synthetic-only-excluded');
"""
    fixture_env = dict(env)
    fixture_env["PGDATABASE"] = source_database
    result = subprocess.run(
        [
            "psql",
            "-X",
            "-q",
            "-v",
            "ON_ERROR_STOP=1",
            "--no-password",
            "--host",
            "127.0.0.1",
            "--port",
            "54322",
            "--username",
            "postgres",
            "--dbname",
            source_database,
        ],
        env=fixture_env,
        check=False,
        input=sql,
        text=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if result.returncode != 0:
        raise RuntimeError("Synthetic fixture rows and schemas were not created.")
    print("SYNTHETIC_SOURCE: READY")
    return 0


def dump(source_database: str, token: str, schema_names: list[str]) -> int:
    require_token(token)
    if not SOURCE_PATTERN.fullmatch(source_database):
        raise ValueError("Synthetic source database name is invalid.")
    if not schema_names or "public" not in schema_names:
        raise ValueError("Production schema allowlist was not supplied.")
    if len(schema_names) != len(set(schema_names)) or set(schema_names) - APPROVED_SCHEMAS:
        raise ValueError("Production schema allowlist contains an unapproved schema.")

    env = local_connection_environment()
    env["PGDATABASE"] = source_database
    args = [
        "pg_dump",
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--no-password",
        "--host=127.0.0.1",
        "--port=54322",
        "--username=postgres",
        f"--dbname={source_database}",
    ]
    args.extend(f"--schema={schema}" for schema in schema_names)
    result = subprocess.run(
        args,
        env=env,
        check=False,
        stdin=subprocess.DEVNULL,
        stdout=sys.stdout.buffer,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode


def verify(target_database: str, token: str) -> int:
    require_token(token)
    if not TARGET_PATTERN.fullmatch(target_database):
        raise ValueError("Synthetic target database name is invalid.")
    env = local_connection_environment()
    env["PGDATABASE"] = target_database
    query = (
        f"SELECT (SELECT marker FROM public.getflow_backup_probe_{token} LIMIT 1) || '|' || "
        f"(SELECT count(*)::text FROM public.getflow_backup_probe_{token}) || '|' || "
        f"(to_regclass('vault.secret_probe_{token}') IS NULL)::text;"
    )
    result = subprocess.run(
        [
            "psql",
            "-X",
            "-A",
            "-t",
            "-q",
            "-v",
            "ON_ERROR_STOP=1",
            "--no-password",
            "--host",
            "127.0.0.1",
            "--port",
            "54322",
            "--username",
            "postgres",
            "--dbname",
            target_database,
            "-c",
            query,
        ],
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError("Synthetic restore verification query failed.")
    print(result.stdout, end="")
    return 0


def database_has_probe(database: str, token: str) -> bool:
    env = local_connection_environment()
    query = (
        "SELECT to_regclass('public.getflow_backup_probe_"
        + token
        + "') IS NOT NULL;"
    )
    result = subprocess.run(
        [
            "psql",
            "-X",
            "-A",
            "-t",
            "-q",
            "-v",
            "ON_ERROR_STOP=1",
            "--no-password",
            "--host",
            "127.0.0.1",
            "--port",
            "54322",
            "--username",
            "postgres",
            "--dbname",
            database,
            "-c",
            query,
        ],
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0 and result.stdout.strip() == "t"


def database_exists(database: str) -> bool:
    if not SOURCE_PATTERN.fullmatch(database) and not TARGET_PATTERN.fullmatch(database):
        raise ValueError("Synthetic database name is invalid.")
    env = local_connection_environment()
    result = subprocess.run(
        [
            "psql",
            "-X",
            "-A",
            "-t",
            "-q",
            "-v",
            "ON_ERROR_STOP=1",
            "--no-password",
            "--host",
            "127.0.0.1",
            "--port",
            "54322",
            "--username",
            "postgres",
            "--dbname",
            "postgres",
            "-c",
            "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = '" + database + "');",
        ],
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )
    return result.returncode == 0 and result.stdout.strip() == "t"


def cleanup(source_database: str, target_database: str | None, token: str) -> int:
    require_token(token)
    if not SOURCE_PATTERN.fullmatch(source_database):
        raise ValueError("Synthetic source database name is invalid.")
    if target_database and not TARGET_PATTERN.fullmatch(target_database):
        raise ValueError("Synthetic target database name is invalid.")
    env = local_connection_environment()
    databases = [source_database]
    if target_database:
        databases.append(target_database)
    for database in databases:
        if database == source_database and not database_has_probe(database, token):
            raise RuntimeError("Synthetic source marker was missing; database retained.")
        if database != source_database and not database_exists(database):
            continue
        removed = run(
            [
                "dropdb",
                "--if-exists",
                "--no-password",
                "--host",
                "127.0.0.1",
                "--port",
                "54322",
                "--username",
                "postgres",
                "--maintenance-db",
                "postgres",
                database,
            ],
            env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
        )
        if removed != 0:
            raise RuntimeError("Synthetic database cleanup failed.")
    print("SYNTHETIC_DATABASES: REMOVED")
    return 0


def cleanup_target_only(target_database: str) -> int:
    if not TARGET_PATTERN.fullmatch(target_database):
        raise ValueError("Synthetic target database name is invalid.")
    if database_exists(target_database):
        env = local_connection_environment()
        removed = run(
            [
                "dropdb",
                "--if-exists",
                "--no-password",
                "--host",
                "127.0.0.1",
                "--port",
                "54322",
                "--username",
                "postgres",
                "--maintenance-db",
                "postgres",
                target_database,
            ],
            env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
        )
        if removed != 0:
            raise RuntimeError("Synthetic target cleanup failed.")
    print("SYNTHETIC_TARGET: REMOVED")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    setup_parser = subparsers.add_parser("setup")
    setup_parser.add_argument("--source-database", required=True)
    setup_parser.add_argument("--token", required=True)

    dump_parser = subparsers.add_parser("dump")
    dump_parser.add_argument("--source-database", required=True)
    dump_parser.add_argument("--token", required=True)
    dump_parser.add_argument("--schema-list", required=True)

    verify_parser = subparsers.add_parser("verify")
    verify_parser.add_argument("--target-database", required=True)
    verify_parser.add_argument("--token", required=True)

    cleanup_parser = subparsers.add_parser("cleanup")
    cleanup_parser.add_argument("--source-database", required=True)
    cleanup_parser.add_argument("--target-database", required=True)
    cleanup_parser.add_argument("--token", required=True)

    cleanup_source_parser = subparsers.add_parser("cleanup-source-only")
    cleanup_source_parser.add_argument("--source-database", required=True)
    cleanup_source_parser.add_argument("--token", required=True)

    cleanup_target_parser = subparsers.add_parser("cleanup-target-only")
    cleanup_target_parser.add_argument("--target-database", required=True)

    args = parser.parse_args()
    try:
        if args.command == "setup":
            return setup_with_sql(args.source_database, args.token)
        if args.command == "dump":
            return dump(args.source_database, args.token, args.schema_list.split(","))
        if args.command == "verify":
            return verify(args.target_database, args.token)
        if args.command == "cleanup":
            return cleanup(args.source_database, args.target_database, args.token)
        if args.command == "cleanup-source-only":
            return cleanup(args.source_database, None, args.token)
        if args.command == "cleanup-target-only":
            return cleanup_target_only(args.target_database)
    except (OSError, RuntimeError, ValueError):
        print("SYNTHETIC_RESTORE: FAILED")
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
