#!/usr/bin/env python3
"""Compatibility entry point for the protected agent-society budget ledger."""

import runpy
from pathlib import Path

ledger = Path(__file__).resolve().parents[1] / "ops" / "agent-society" / "budget.py"
runpy.run_path(str(ledger), run_name="__main__")
