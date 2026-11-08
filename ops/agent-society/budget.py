#!/usr/bin/env python3
"""Shared active-time ledger for all sequential Clareira agent roles."""

import argparse
import fcntl
import json
import math
import os
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

DAILY_LIMIT_SECONDS = 8 * 60 * 60
DEFAULT_TIMEZONE = "Europe/Berlin"
DEFAULT_STATE_DIRECTORY = "/var/lib/clareira-agent-society"


def timezone():
    return ZoneInfo(os.environ.get("AGENT_TIMEZONE", DEFAULT_TIMEZONE))


def paths():
    directory = Path(os.environ.get("AGENT_STATE_DIRECTORY", DEFAULT_STATE_DIRECTORY))
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    return directory, directory / "active-time.json", directory / "active-time.lock"


def load_days(state_path):
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    days = state.get("days")
    if not isinstance(days, dict):
        raise ValueError("invalid active-time state")
    cleaned = {}
    for key, seconds in days.items():
        if not isinstance(key, str) or not isinstance(seconds, int) or seconds < 0:
            raise ValueError("invalid active-time entry")
        date.fromisoformat(key)
        cleaned[key] = seconds
    return cleaned


def store_days(state_path, days):
    cutoff = datetime.now(timezone()).date() - timedelta(days=14)
    kept = {key: value for key, value in days.items() if date.fromisoformat(key) >= cutoff}
    temporary = state_path.with_name(f"{state_path.name}.{os.getpid()}.tmp")
    temporary.write_text(json.dumps({"days": kept}, sort_keys=True) + "\n", encoding="utf-8")
    temporary.chmod(0o600)
    temporary.replace(state_path)


def add_interval(days, start_epoch, end_epoch, zone):
    if start_epoch < 0 or end_epoch < start_epoch:
        raise ValueError("invalid active-time interval")
    cursor = float(start_epoch)
    finish = float(end_epoch)
    while cursor < finish:
        local_time = datetime.fromtimestamp(cursor, zone)
        next_day = datetime.combine(local_time.date() + timedelta(days=1), time.min, zone)
        boundary = next_day.timestamp()
        if boundary <= cursor:
            raise ValueError("could not find next local midnight")
        segment_end = min(finish, boundary)
        key = local_time.date().isoformat()
        days[key] = days.get(key, 0) + math.ceil(segment_end - cursor)
        cursor = segment_end


def read_days():
    directory, state_path, lock_path = paths()
    with lock_path.open("a", encoding="utf-8") as lock:
        os.chmod(lock_path, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        return load_days(state_path)


def remaining_seconds(day=None):
    zone = timezone()
    day = day or datetime.now(zone).date().isoformat()
    date.fromisoformat(day)
    used = read_days().get(day, 0)
    return max(0, DAILY_LIMIT_SECONDS - used)


def record_interval(start_epoch, end_epoch):
    directory, state_path, lock_path = paths()
    with lock_path.open("a", encoding="utf-8") as lock:
        os.chmod(lock_path, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        days = load_days(state_path)
        add_interval(days, start_epoch, end_epoch, timezone())
        store_days(state_path, days)


def status():
    zone = timezone()
    today = datetime.now(zone).date().isoformat()
    used = read_days().get(today, 0)
    return {
        "day": today,
        "timezone": str(zone),
        "limit_seconds": DAILY_LIMIT_SECONDS,
        "used_seconds": used,
        "remaining_seconds": max(0, DAILY_LIMIT_SECONDS - used),
    }


def until_reset_seconds():
    zone = timezone()
    now = datetime.now(zone)
    next_day = datetime.combine(now.date() + timedelta(days=1), time.min, zone)
    return max(0, math.ceil(next_day.timestamp() - now.timestamp()))


def main():
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    remaining = commands.add_parser("remaining")
    remaining.add_argument("--day", help="local YYYY-MM-DD day (defaults to today)")
    commands.add_parser("status", help="show today's shared active-time budget")
    record = commands.add_parser("record")
    record.add_argument("start_epoch", type=float)
    record.add_argument("end_epoch", type=float)
    commands.add_parser("until-reset", help="seconds until the next local midnight")
    args = parser.parse_args()

    if args.command == "remaining":
        print(remaining_seconds(args.day))
        return
    if args.command == "status":
        print(json.dumps(status(), sort_keys=True))
        return
    if args.command == "until-reset":
        print(until_reset_seconds())
        return
    record_interval(args.start_epoch, args.end_epoch)


if __name__ == "__main__":
    main()
