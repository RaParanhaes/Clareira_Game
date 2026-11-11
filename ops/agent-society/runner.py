#!/usr/bin/env python3
"""Sequential, evidence-gated agent society for the single Clareira checkout."""

import argparse
import fcntl
import importlib.util
import json
import os
import re
import shlex
import shutil
import signal
import subprocess
import sys
import threading
import time
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
SOCIETY = ROOT / "ops" / "agent-society"
CONFIG = json.loads((SOCIETY / "config.json").read_text(encoding="utf-8"))
ZONE = ZoneInfo(CONFIG["timezone"])
STATE = Path(os.environ.get("AGENT_STATE_DIRECTORY", CONFIG["state_directory"]))
CODEX = os.environ.get("GAME_AGENT_CODEX", shutil.which("codex") or "/usr/local/bin/codex")
NODE = shutil.which("node") or "/usr/bin/node"
ACTIVE_PROCESS = None
STOP_REQUESTED = False
STOP_EVENT = threading.Event()
MODEL_ACTIVE_SECONDS = 0.0
PROTECTED_TASK_PATHS = {
    "scripts/daily_budget.py", "scripts/daily_budget_test.py", "scripts/wake.sh",
    "scripts/agent-prompt.md", "scripts/agent_society_test.py",
}


def load_budget_module():
    path = SOCIETY / "budget.py"
    spec = importlib.util.spec_from_file_location("clareira_society_budget", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


BUDGET = load_budget_module()


def ensure_state():
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    STATE.chmod(0o700)
    cycles = STATE / "cycles"
    cycles.mkdir(mode=0o700, exist_ok=True)
    cycles.chmod(0o700)
    return cycles


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(path.name + f".{os.getpid()}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary.chmod(0o600)
    temporary.replace(path)


def run_local(argv, timeout=15, cwd=ROOT, environment=None):
    env = os.environ.copy()
    env.update({"PYTHONDONTWRITEBYTECODE": "1", "AGENT_TIMEZONE": CONFIG["timezone"], "AGENT_STATE_DIRECTORY": str(STATE)})
    if environment:
        env.update(environment)
    try:
        result = subprocess.run(argv, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout, check=False)
        return {"argv": list(map(str, argv)), "exit_code": result.returncode, "stdout": result.stdout, "stderr": result.stderr, "timed_out": False}
    except subprocess.TimeoutExpired as error:
        return {
            "argv": list(map(str, argv)),
            "exit_code": None,
            "stdout": (error.stdout or "").decode(errors="replace") if isinstance(error.stdout, bytes) else (error.stdout or ""),
            "stderr": (error.stderr or "").decode(errors="replace") if isinstance(error.stderr, bytes) else (error.stderr or ""),
            "timed_out": True,
        }
    except OSError as error:
        return {"argv": list(map(str, argv)), "exit_code": None, "stdout": "", "stderr": str(error), "timed_out": False}


def systemctl_active(unit):
    if not shutil.which("systemctl"):
        return False
    result = run_local(["systemctl", "is-active", "--quiet", unit], timeout=5)
    return result["exit_code"] == 0


def game_dev_readiness():
    binary = shutil.which("game-dev")
    if not binary:
        return {"available": False, "reason": "game-dev CLI is not installed"}
    commands = [
        [binary, "--version"],
        [binary, "capabilities", "--json"],
        [binary, "doctor", "--json"],
    ]
    reports = [run_local(command, timeout=20) for command in commands]
    healthy = all(item["exit_code"] == 0 and not item["timed_out"] for item in reports)
    return {"available": healthy, "reason": "" if healthy else "game-dev readiness check failed", "reports": reports}


def preflight():
    ensure_state()
    required = [
        "ROOT_POLICY.md", "AGENTS.md", "DELIVERY_PLAN.md", "GAME_BRIEF.md",
        "ART_DIRECTION.md", "memory/STATUS.md",
    ]
    git_dir = run_local(["git", "rev-parse", "--git-dir"])
    branch_result = run_local(["git", "branch", "--format=%(refname:short)"])
    branches = branch_result["stdout"].splitlines()
    worktree_result = run_local(["git", "worktree", "list", "--porcelain"])
    worktrees = [line[9:] for line in worktree_result["stdout"].splitlines() if line.startswith("worktree ")]
    codex_available = bool(shutil.which(CODEX) or Path(CODEX).is_file())
    login = run_local([CODEX, "login", "status"], timeout=20) if codex_available else {"exit_code": None, "stderr": "Codex CLI missing"}
    game_dev = game_dev_readiness()
    report = {
        "root": str(ROOT),
        "state_directory": str(STATE),
        "daily_active_limit_seconds": CONFIG["daily_active_seconds"],
        "budget_config_matches_ledger": CONFIG["daily_active_seconds"] == BUDGET.DAILY_LIMIT_SECONDS,
        "timezone": CONFIG["timezone"],
        "model": CONFIG["model"],
        "reasoning_effort": CONFIG["reasoning_effort"],
        "parallel_roles": CONFIG["parallel_roles"],
        "required_files": {item: (ROOT / item).is_file() for item in required},
        "codex_executable": str(shutil.which(CODEX) or CODEX),
        "codex_login_ok": login.get("exit_code") == 0,
        "codex_login_message": (login.get("stdout") or login.get("stderr") or "").strip()[:300],
        "git_ok": git_dir["exit_code"] == 0,
        "branch": branches[0] if len(branches) == 1 else None,
        "branches": branches,
        "worktrees": worktrees,
        "single_checkout_ok": len(worktrees) == 1 and Path(worktrees[0]).resolve() == ROOT.resolve(),
        "preview_room_active": systemctl_active("clareira-dev-preview-room.service"),
        "preview_page_active": systemctl_active("clareira-dev-preview-page.service"),
        "browser_runtime_available": Path("/opt/clareira-browser/node_modules/playwright-core/index.mjs").is_file(),
        "chromium_available": Path("/root/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome").is_file(),
        "node_available": bool(shutil.which("node")),
        "npm_available": bool(shutil.which("npm")),
        "game_dev": game_dev,
        "budget": BUDGET.status(),
    }
    required_ok = all(report["required_files"].values())
    topology_ok = report["git_ok"] and report["branch"] == "master" and report["branches"] == ["master"] and report["single_checkout_ok"]
    report["ready"] = required_ok and topology_ok and report["budget_config_matches_ledger"] and report["codex_login_ok"] and report["browser_runtime_available"] and report["chromium_available"] and report["node_available"] and report["npm_available"] and report["preview_room_active"] and report["preview_page_active"]
    return report


def git(args, env=None, input_bytes=None, timeout=60):
    environment = os.environ.copy()
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    if env:
        environment.update(env)
    return subprocess.run(["git", *args], cwd=ROOT, env=environment, input=input_bytes, capture_output=True, timeout=timeout, check=False)


def snapshot_tree(cycle_dir, label):
    index_path = cycle_dir / f"{label}.index"
    if index_path.exists():
        index_path.unlink()
    index_env = {"GIT_INDEX_FILE": str(index_path)}
    read_tree = git(["read-tree", "HEAD"], env=index_env)
    if read_tree.returncode != 0:
        raise RuntimeError(f"git read-tree failed: {read_tree.stderr.decode(errors='replace')[-1000:]}")
    add_tracked = git(["add", "-u", "--", "."], env=index_env, timeout=120)
    if add_tracked.returncode != 0:
        raise RuntimeError(f"git add tracked snapshot failed: {add_tracked.stderr.decode(errors='replace')[-1000:]}")
    add = git(["add", "-A", "--", "game", "scripts", "database"], env=index_env, timeout=120)
    if add.returncode != 0:
        raise RuntimeError(f"git add snapshot failed: {add.stderr.decode(errors='replace')[-1000:]}")
    tree = git(["write-tree"], env=index_env)
    if tree.returncode != 0:
        raise RuntimeError(f"git write-tree failed: {tree.stderr.decode(errors='replace')[-1000:]}")
    return tree.stdout.decode().strip()


def tree_patch(before_tree, after_tree, cycle_dir, filename="candidate.patch"):
    patch = git(["diff", "--binary", "--full-index", before_tree, after_tree], timeout=120)
    if patch.returncode != 0:
        raise RuntimeError(f"git diff failed: {patch.stderr.decode(errors='replace')[-1000:]}")
    output = cycle_dir / filename
    output.write_bytes(patch.stdout)
    output.chmod(0o600)
    names = git(["diff", "--name-only", "-z", before_tree, after_tree], timeout=120)
    changed_paths = [name.decode(errors="surrogateescape") for name in names.stdout.split(b"\0") if name]
    text = git(["diff", "--no-ext-diff", "--unified=50", before_tree, after_tree], timeout=120)
    text_diff = text.stdout.decode(errors="replace")
    return {
        "patch_path": str(output),
        "patch_bytes": len(patch.stdout),
        "changed_paths": changed_paths,
        "text_diff": text_diff,
        "text_diff_truncated": len(text_diff) > 80000,
        "text_diff_for_review": text_diff[:80000],
    }


def rollback_tree(current_tree, baseline_tree, cycle_dir, scope_paths=None):
    observed = snapshot_tree(cycle_dir, "pre-rollback")
    if observed != current_tree:
        return {"rolled_back": False, "reason": "checkout changed after the candidate was reviewed; preserving concurrent edits"}
    command = ["diff", "--binary", "--full-index", current_tree, baseline_tree]
    if scope_paths is not None:
        if not scope_paths:
            return {"rolled_back": True, "reason": "no candidate paths were in scope"}
        command.extend(["--", *scope_paths])
    reverse = git(command, timeout=120)
    if reverse.returncode != 0:
        return {"rolled_back": False, "reason": reverse.stderr.decode(errors="replace")[-1000:]}
    if not reverse.stdout:
        return {"rolled_back": True, "reason": "candidate had no file changes"}
    applied = git(["apply", "--binary", "--whitespace=nowarn"], input_bytes=reverse.stdout, timeout=120)
    if applied.returncode != 0:
        return {"rolled_back": False, "reason": applied.stderr.decode(errors="replace")[-1000:]}
    restored = snapshot_tree(cycle_dir, "post-rollback")
    compare = ["diff", "--quiet", restored, baseline_tree]
    if scope_paths is not None:
        compare.extend(["--", *scope_paths])
    check = git(compare, timeout=120)
    matches = check.returncode == 0
    reason = "restored the cycle-start worktree" if scope_paths is None else "restored candidate paths; preserved changes outside the plan"
    return {"rolled_back": matches, "reason": reason if matches else "post-rollback candidate paths do not match the cycle-start tree"}


def allowed_plan_paths(paths):
    if not isinstance(paths, list) or not paths:
        return False, "plan must name at least one editable path"
    roots = CONFIG["allowed_task_roots"]
    for raw_path in paths:
        if not isinstance(raw_path, str) or not raw_path or raw_path.startswith("/") or ".." in Path(raw_path).parts or any(char in raw_path for char in "*?[]"):
            return False, f"unsafe path in plan: {raw_path!r}"
        if not any(raw_path.startswith(root) for root in roots):
            return False, f"path is outside allowed game code roots: {raw_path}"
        if raw_path in PROTECTED_TASK_PATHS:
            return False, f"protected society control file: {raw_path}"
    return True, ""


def changed_paths_allowed(changed, allowed):
    normalized = [p.rstrip("/") for p in allowed]
    for path in changed:
        if path in PROTECTED_TASK_PATHS:
            return False, path
        if not any(path == root or path.startswith(root + "/") for root in normalized):
            return False, path
    return True, ""


def safe_test_argv(command):
    if command == "npm test":
        return ["npm", "test"]
    if command == "npm run content:check":
        return ["npm", "run", "content:check"]
    if command == "python3 -m unittest discover -s scripts -p '*_test.py'":
        return ["python3", "-m", "unittest", "discover", "-s", "scripts", "-p", "*_test.py"]
    try:
        parts = shlex.split(command)
    except ValueError:
        return None
    if len(parts) == 3 and parts[:2] == ["node", "--test"]:
        candidate = Path(parts[2])
        if not candidate.is_absolute() and ".." not in candidate.parts and candidate.suffix in {".js", ".mjs"} and candidate.parts and candidate.parts[0] in {"game", "scripts", "database"} and (ROOT / candidate).is_file():
            return ["node", "--test", str(candidate)]
    return None


def new_cycle_id():
    return datetime.now(ZONE).strftime("%Y%m%dT%H%M%S%f%z")


def latest_report():
    path = STATE / "latest.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def latest_summary(report):
    if not report:
        return None
    fields = ("cycle_id", "status", "title", "goal", "changed_paths", "review", "integration", "finished_at")
    return {key: report[key] for key in fields if key in report}


def run_external_check(name, argv, cycle_dir, timeout=900):
    check_dir = cycle_dir / "checks"
    check_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    stdout_path = check_dir / f"{name}.stdout.txt"
    stderr_path = check_dir / f"{name}.stderr.txt"
    env = os.environ.copy()
    env.update({"PYTHONDONTWRITEBYTECODE": "1", "AGENT_STATE_DIRECTORY": str(STATE), "AGENT_TIMEZONE": CONFIG["timezone"]})
    started = time.monotonic()
    timed_out = False
    try:
        process = subprocess.Popen(argv, cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
        try:
            stdout, stderr = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                stdout, stderr = process.communicate(timeout=8)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                stdout, stderr = process.communicate()
        stdout = stdout or ""
        stderr = stderr or ""
        stdout_path.write_text(stdout, encoding="utf-8")
        stderr_path.write_text(stderr, encoding="utf-8")
        exit_code = process.returncode
        status = "timed_out" if timed_out else "passed" if exit_code == 0 else "failed"
        detail = stderr or stdout
    except OSError as error:
        stdout_path.write_text("", encoding="utf-8")
        stderr_path.write_text(str(error), encoding="utf-8")
        status, exit_code, detail = "failed", None, str(error)
    elapsed = round(time.monotonic() - started, 2)
    return {
        "name": name,
        "status": status,
        "exit_code": exit_code,
        "timed_out": timed_out,
        "duration_seconds": elapsed,
        "argv": list(map(str, argv)),
        "stdout_path": str(stdout_path),
        "stderr_path": str(stderr_path),
        "summary": (detail or "").strip()[-6000:],
    }


def role_text(name):
    return (SOCIETY / "prompts" / f"{name}.md").read_text(encoding="utf-8")


def schema_path(name):
    return SOCIETY / "schemas" / f"{name}.schema.json"


def budget_remaining():
    return BUDGET.remaining_seconds()


def terminate_active_process():
    process = ACTIVE_PROCESS
    if process is None or process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=8)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def request_stop(_signum, _frame):
    global STOP_REQUESTED
    STOP_REQUESTED = True
    STOP_EVENT.set()
    terminate_active_process()


def invoke_role(role, prompt, cycle_dir, images=None, timeout_seconds=None):
    global ACTIVE_PROCESS, MODEL_ACTIVE_SECONDS
    remaining = budget_remaining()
    if remaining <= 2:
        return {"status": "budget_exhausted", "remaining_seconds": remaining}
    maximum = timeout_seconds or CONFIG["role_timeout_seconds"][role]
    timeout = min(maximum, remaining - 2)
    result_path = cycle_dir / f"{role}.json"
    stdout_path = cycle_dir / f"{role}.stdout.log"
    stderr_path = cycle_dir / f"{role}.stderr.log"
    command = [
        CODEX, "exec", "--cd", str(ROOT), "--model", CONFIG["model"],
        "-c", f'model_reasoning_effort="{CONFIG["reasoning_effort"]}"',
        "-c", 'approval_policy="never"',
        "--sandbox", "read-only" if role in {"planner", "reviewer", "final_reviewer", "integrator"} else "workspace-write",
        "--ephemeral",
        "--output-schema", str(schema_path({"planner": "plan", "implementer": "implementation", "repair": "implementation", "reviewer": "review", "final_reviewer": "review", "integrator": "integration"}[role])),
        "--output-last-message", str(result_path),
    ]
    for image_path in images or []:
        command.extend(["--image", str(image_path)])
    command.append("-")
    env = os.environ.copy()
    env.update({"PYTHONDONTWRITEBYTECODE": "1", "AGENT_STATE_DIRECTORY": str(STATE), "AGENT_TIMEZONE": CONFIG["timezone"]})
    start_epoch = time.time()
    started = time.monotonic()
    return_code = None
    timed_out = False
    error = ""
    try:
        with stdout_path.open("wb") as stdout, stderr_path.open("wb") as stderr:
            os.chmod(stdout_path, 0o600)
            os.chmod(stderr_path, 0o600)
            ACTIVE_PROCESS = subprocess.Popen(
                command, cwd=ROOT, env=env, stdin=subprocess.PIPE, stdout=stdout, stderr=stderr,
                start_new_session=True,
            )
            try:
                ACTIVE_PROCESS.communicate(prompt.encode("utf-8"), timeout=timeout)
            except subprocess.TimeoutExpired:
                timed_out = True
                terminate_active_process()
            return_code = ACTIVE_PROCESS.returncode
    except OSError as exception:
        error = str(exception)
    finally:
        ACTIVE_PROCESS = None
        if return_code is not None:
            try:
                BUDGET.record_interval(start_epoch, time.time())
            except Exception as exception:  # fail closed if time could not be recorded
                error = f"active-time ledger write failed: {exception}"
                return_code = 74
    elapsed = round(time.monotonic() - started, 2)
    if return_code is not None:
        MODEL_ACTIVE_SECONDS += elapsed
    if STOP_REQUESTED:
        return {"status": "interrupted", "duration_seconds": elapsed, "error": error}
    if timed_out:
        return {"status": "timed_out", "duration_seconds": elapsed, "error": error, "timeout_seconds": timeout}
    if return_code != 0:
        return {"status": "failed", "duration_seconds": elapsed, "exit_code": return_code, "error": error, "stderr_path": str(stderr_path)}
    try:
        response = json.loads(result_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as exception:
        return {"status": "invalid_output", "duration_seconds": elapsed, "error": str(exception), "stderr_path": str(stderr_path)}
    return {"status": "ok", "duration_seconds": elapsed, "response": response, "output_path": str(result_path)}


def build_prompt(role, sections):
    return "\n\n".join([role_text(role), *sections])


def read_text(path, limit=10000):
    try:
        return path.read_text(encoding="utf-8", errors="replace")[-limit:]
    except OSError as error:
        return f"[unavailable: {error}]"


def select_image_pairs(before_dir, after_dir, max_pairs=4):
    if not before_dir.is_dir() or not after_dir.is_dir():
        return []
    before = {item.name: item for item in before_dir.glob("*.png") if item.is_file()}
    after = {item.name: item for item in after_dir.glob("*.png") if item.is_file()}
    common = sorted(before.keys() & after.keys(), key=lambda name: (0 if "desktop" in name.lower() else 1, 0 if "mobile" in name.lower() else 1, name))
    paths = []
    for name in common[:max_pairs]:
        paths.extend([before[name], after[name]])
    return paths


def validate_plan(plan):
    if plan.get("decision") != "propose":
        return True, ""
    valid_paths, reason = allowed_plan_paths(plan.get("allowed_paths"))
    if not valid_paths:
        return False, reason
    if not plan.get("goal") or not plan.get("acceptance_criteria"):
        return False, "plan needs a concrete goal and acceptance criteria"
    if plan.get("test_command") and safe_test_argv(plan["test_command"]) is None:
        return False, "test command is outside the safe command allowlist"
    browser_check = plan.get("browser_check", "")
    if browser_check and browser_check not in CONFIG["browser_checks"]:
        return False, "browser check is outside the checked-in project allowlist"
    evidence = set(plan.get("required_evidence", []))
    domain_evidence = {
        "gameplay_physics": {"gameplay"},
        "character_animation": {"visual"},
        "visual_effects": {"visual"},
        "ui_ux": {"visual", "ui_ux"},
        "world_content": {"gameplay"},
    }
    missing_domain_evidence = domain_evidence.get(plan.get("domain"), set()) - evidence
    if missing_domain_evidence:
        return False, f"domain requires evidence labels: {', '.join(sorted(missing_domain_evidence))}"
    if evidence & {"gameplay", "visual", "ui_ux"} and not browser_check:
        return False, "gameplay, visual, and UI/UX goals require an existing browser check"
    if plan.get("domain") == "performance" or "performance" in evidence:
        return False, "performance work is blocked until game-dev telemetry is available"
    if evidence & {"visual", "ui_ux"} and not shutil.which("game-dev"):
        return False, "visual and UI/UX review workflows are blocked until the game-dev CLI is available"
    return True, ""


def run_preview_browser_check(plan, cycle_dir, stage):
    script = plan.get("browser_check", "")
    if not script:
        return None
    output_dir = cycle_dir / f"{stage}-browser"
    return run_external_check(f"{stage}-browser", [NODE, str(ROOT / script), str(output_dir)], cycle_dir, timeout=1200)


def run_test_checks(plan, cycle_dir, stage, include_full_suite):
    checks = []
    target = plan.get("test_command", "")
    if target:
        argv = safe_test_argv(target)
        if argv:
            label = "full-suite" if target == "npm test" else "targeted"
            checks.append(run_external_check(f"{stage}-{label}", argv, cycle_dir, timeout=300))
    full_suite = next((check for check in checks if check["name"] == f"{stage}-full-suite"), None)
    if include_full_suite and target != "npm test":
        full_suite = run_external_check(f"{stage}-full-suite", ["npm", "test"], cycle_dir, timeout=300)
        checks.append(full_suite)
    if include_full_suite and full_suite and full_suite["status"] != "passed":
        checks.append(run_external_check(
            f"{stage}-python-suite",
            ["python3", "-m", "unittest", "discover", "-s", "scripts", "-p", "*_test.py"],
            cycle_dir,
            timeout=300,
        ))
    return checks


def all_passed(checks):
    return all(check["status"] == "passed" for check in checks)


def test_check_profile(check):
    if check["status"] == "passed":
        return {"complete": True, "failures": []}
    if check["status"] == "timed_out":
        return {"complete": False, "failures": []}
    stdout = read_text(Path(check["stdout_path"]), limit=2_000_000)
    stderr = read_text(Path(check["stderr_path"]), limit=500_000)
    combined = stdout + "\n" + stderr
    node_summary = re.search(r"^# tests (\d+)\s*$", stdout, re.MULTILINE) and re.search(r"^# fail (\d+)\s*$", stdout, re.MULTILINE)
    if node_summary:
        failures = re.findall(r"^not ok \d+ - (.+)$", stdout, re.MULTILINE)
        return {"complete": True, "failures": failures}
    python_summary = re.search(r"^Ran \d+ tests? in .+$", combined, re.MULTILINE)
    if python_summary:
        failures = re.findall(r"^(?:FAIL|ERROR): (.+)$", combined, re.MULTILINE)
        return {"complete": True, "failures": failures}
    return {"complete": False, "failures": []}


def test_regression_gate(baseline_checks, candidate_checks):
    def check_kind(name):
        for stage in ("baseline-", "candidate-", "repaired-"):
            if name.startswith(stage):
                return name[len(stage):]
        return name

    baseline_by_name = {check_kind(item["name"]): item for item in baseline_checks}
    details = []
    passed = True
    for candidate in candidate_checks:
        suffix = check_kind(candidate["name"])
        if candidate["status"] == "passed":
            details.append({"check": suffix, "status": "passed"})
            continue
        if suffix == "targeted":
            passed = False
            details.append({"check": suffix, "status": "failed", "reason": "focused candidate check must pass"})
            continue
        baseline = baseline_by_name.get(suffix)
        if baseline is None:
            passed = False
            details.append({"check": suffix, "status": "uncompared", "reason": "no matching baseline check"})
            continue
        before = test_check_profile(baseline)
        after = test_check_profile(candidate)
        no_new_failures = before["complete"] and after["complete"] and set(after["failures"]).issubset(before["failures"])
        details.append({
            "check": suffix,
            "status": "no_new_failures" if no_new_failures else "regression_or_incomplete",
            "baseline_failures": before["failures"],
            "candidate_failures": after["failures"],
        })
        passed = passed and no_new_failures
    return {"passed": passed, "details": details}


def restart_preview_room():
    if not systemctl_active("clareira-dev-preview-room.service"):
        return {"status": "not_active", "detail": "preview room service is not active"}
    result = run_local(["systemctl", "restart", "clareira-dev-preview-room.service"], timeout=40)
    return {"status": "passed" if result["exit_code"] == 0 else "failed", "detail": (result["stderr"] or result["stdout"]).strip()[-2000:]}


def append_result(cycle_dir, result):
    report_path = cycle_dir / "result.json"
    write_json(report_path, result)
    write_json(STATE / "latest.json", result)
    return result


def blocked_result(cycle_id, cycle_dir, baseline_tree, reason, reports=None):
    return append_result(cycle_dir, {
        "cycle_id": cycle_id,
        "status": "blocked",
        "reason": reason,
        "baseline_tree": baseline_tree,
        "model_active_seconds": round(MODEL_ACTIVE_SECONDS),
        "reports": reports or {},
        "finished_at": datetime.now(ZONE).isoformat(),
    })


def execute_cycle():
    global MODEL_ACTIVE_SECONDS
    MODEL_ACTIVE_SECONDS = 0.0
    ensure_state()
    cycle_id = new_cycle_id()
    cycle_dir = STATE / "cycles" / cycle_id
    cycle_dir.mkdir(parents=True, mode=0o700)
    if budget_remaining() < CONFIG["minimum_cycle_start_seconds"]:
        return blocked_result(cycle_id, cycle_dir, None, "not enough active-time budget remains for planning, implementation, and independent review")
    readiness = preflight()
    if not readiness["ready"]:
        return blocked_result(cycle_id, cycle_dir, None, "system preflight is not ready; no model session was started", {"preflight": readiness})
    try:
        baseline_tree = snapshot_tree(cycle_dir, "baseline")
    except Exception as error:
        return blocked_result(cycle_id, cycle_dir, None, f"could not capture the checkout baseline: {error}")
    previous = latest_summary(latest_report())
    planner_sections = [
        f"Readiness and evidence tools:\n{json.dumps(readiness, ensure_ascii=False, indent=2)}",
        f"Previous society result:\n{json.dumps(previous, ensure_ascii=False, indent=2) if previous else 'none'}",
        f"Current repository root: {ROOT}",
        "Choose one task and return the required JSON. Do not edit files.",
    ]
    planner = invoke_role("planner", build_prompt("planning", planner_sections), cycle_dir)
    if planner.get("status") != "ok":
        return blocked_result(cycle_id, cycle_dir, baseline_tree, f"planner did not return a valid plan: {planner.get('status')}", {"planner": planner})
    plan = planner["response"]
    write_json(cycle_dir / "plan.json", plan)
    tree_after_plan = snapshot_tree(cycle_dir, "after-plan")
    if tree_after_plan != baseline_tree:
        unexpected_diff = tree_patch(baseline_tree, tree_after_plan, cycle_dir, "planner-phase-checkout-changes.patch")
        return append_result(cycle_dir, {
            "cycle_id": cycle_id,
            "status": "hold_external_changes",
            "reason": "checkout changed during the read-only planning phase; preserving all concurrent changes",
            "baseline_tree": baseline_tree,
            "changed_paths": unexpected_diff["changed_paths"],
            "change_patch": unexpected_diff["patch_path"],
            "model_active_seconds": round(MODEL_ACTIVE_SECONDS),
            "reports": {"planner": planner},
            "finished_at": datetime.now(ZONE).isoformat(),
        })
    if plan.get("decision") in {"no_change", "blocked"}:
        result = {
            "cycle_id": cycle_id, "status": plan["decision"], "reason": plan.get("blocked_reason", ""),
            "title": plan.get("title", ""), "baseline_tree": baseline_tree,
            "model_active_seconds": round(MODEL_ACTIVE_SECONDS),
            "plan": plan, "finished_at": datetime.now(ZONE).isoformat(),
        }
        return append_result(cycle_dir, result)
    valid, validation_reason = validate_plan(plan)
    if not valid:
        return blocked_result(cycle_id, cycle_dir, baseline_tree, validation_reason, {"planner": planner, "plan": plan})
    if not readiness["ready"]:
        return blocked_result(cycle_id, cycle_dir, baseline_tree, "system preflight is not ready", {"preflight": readiness, "planner": planner})
    reserve = CONFIG["minimum_reviewer_seconds"] + CONFIG["minimum_integrator_seconds"] + CONFIG["minimum_repair_seconds"] + CONFIG["minimum_reviewer_seconds"]
    available_for_implementation = budget_remaining() - reserve
    if available_for_implementation < 600:
        return blocked_result(cycle_id, cycle_dir, baseline_tree, "daily cap requires reserving time for the independent reviewer and final integrator", {"planner": planner, "plan": plan})

    baseline_tests = run_test_checks(plan, cycle_dir, "baseline", include_full_suite=True)
    baseline_browser = run_preview_browser_check(plan, cycle_dir, "baseline")

    domain_prompt = (SOCIETY / "prompts" / "domains" / f"{plan['domain']}.md").read_text(encoding="utf-8")
    implementer_sections = [
        f"Task plan:\n{json.dumps(plan, ensure_ascii=False, indent=2)}",
        f"Domain specialization:\n{domain_prompt}",
        f"Baseline tree: {baseline_tree}",
        "Implement one focused slice. Do not stage, commit, branch, spawn nested agents, deploy, or edit outside the named allowed paths.",
    ]
    implementation = invoke_role("implementer", build_prompt("implementation", implementer_sections), cycle_dir, timeout_seconds=min(CONFIG["role_timeout_seconds"]["implementer"], available_for_implementation))
    if implementation.get("status") != "ok":
        current = snapshot_tree(cycle_dir, "after-implementation-failure")
        rollback = rollback_tree(current, baseline_tree, cycle_dir, plan["allowed_paths"]) if current != baseline_tree else {"rolled_back": True, "reason": "no file changes"}
        if current != baseline_tree:
            restart_preview_room()
        return blocked_result(cycle_id, cycle_dir, baseline_tree, f"implementation role failed: {implementation.get('status')}", {"planner": planner, "implementation": implementation, "rollback": rollback})
    implementation_report = implementation["response"]
    write_json(cycle_dir / "implementation.json", implementation_report)
    candidate_tree = snapshot_tree(cycle_dir, "candidate")
    written_tree = candidate_tree
    initial_diff = tree_patch(baseline_tree, candidate_tree, cycle_dir)
    if not initial_diff["changed_paths"]:
        return blocked_result(cycle_id, cycle_dir, baseline_tree, "implementation produced no code changes", {"planner": planner, "implementation": implementation_report})
    changes_allowed, disallowed_path = changed_paths_allowed(initial_diff["changed_paths"], plan["allowed_paths"])
    if not changes_allowed or initial_diff["patch_bytes"] > 5_000_000:
        rollback = rollback_tree(candidate_tree, baseline_tree, cycle_dir, plan["allowed_paths"])
        if rollback["rolled_back"]:
            restart_preview_room()
        reason = f"implementation changed a path outside its plan: {disallowed_path}" if not changes_allowed else "candidate patch exceeds the 5 MB review limit"
        return blocked_result(cycle_id, cycle_dir, baseline_tree, reason, {"planner": planner, "implementation": implementation_report, "diff": initial_diff, "rollback": rollback})

    preview_restart = restart_preview_room()
    candidate_tests = run_test_checks(plan, cycle_dir, "candidate", include_full_suite=True)
    candidate_browser = run_preview_browser_check(plan, cycle_dir, "candidate")
    candidate_tree = snapshot_tree(cycle_dir, "candidate-after-checks")
    if candidate_tree != written_tree:
        rollback = rollback_tree(candidate_tree, baseline_tree, cycle_dir, plan["allowed_paths"])
        restore_preview = restart_preview_room() if rollback["rolled_back"] else {"status": "not_restarted", "detail": rollback["reason"]}
        return blocked_result(cycle_id, cycle_dir, baseline_tree, "a test or browser check modified project files", {
            "planner": planner, "implementation": implementation_report, "baseline_tests": baseline_tests,
            "candidate_tests": candidate_tests, "baseline_browser": baseline_browser,
            "candidate_browser": candidate_browser, "rollback": rollback, "restore_preview": restore_preview,
        })
    candidate_diff = tree_patch(baseline_tree, candidate_tree, cycle_dir, "candidate-after-checks.patch")

    test_summary = {
        "baseline": baseline_tests,
        "candidate": candidate_tests,
        "baseline_browser": baseline_browser,
        "candidate_browser": candidate_browser,
        "preview_restart": preview_restart,
        "game_dev": readiness["game_dev"],
        "performance_workflow": "not required for this plan" if "performance" not in required_evidence else "blocked: game-dev CLI is not installed",
        "sealed_visual_workflow": "blocked: game-dev CLI is not installed" if not readiness["game_dev"]["available"] else "available",
    }
    test_summary["regression_gate"] = test_regression_gate(baseline_tests, candidate_tests)
    write_json(cycle_dir / "checks.json", test_summary)
    image_paths = select_image_pairs(cycle_dir / "baseline-browser", cycle_dir / "candidate-browser")
    required_evidence = set(plan.get("required_evidence", []))
    visual_pair_available = len(image_paths) >= 2
    review_sections = [
        f"Plan and acceptance criteria:\n{json.dumps(plan, ensure_ascii=False, indent=2)}",
        f"Implementation report:\n{json.dumps(implementation_report, ensure_ascii=False, indent=2)}",
        f"Exact code changes since the captured before-tree:\n{candidate_diff['text_diff_for_review']}",
        f"Diff metadata:\n{json.dumps({k: candidate_diff[k] for k in ('changed_paths', 'patch_bytes', 'text_diff_truncated')}, ensure_ascii=False, indent=2)}",
        f"Tests and evidence:\n{json.dumps(test_summary, ensure_ascii=False, indent=2)}",
        f"Automated visual evidence gate: {visual_pair_available if required_evidence & {'visual', 'ui_ux'} else 'not required'}",
        "Images are attached in matching before/after pairs. If no images are attached, report visual evidence as missing.",
    ]
    reviewer_time = max(1, budget_remaining() - CONFIG["minimum_integrator_seconds"])
    review = invoke_role("reviewer", build_prompt("review", review_sections), cycle_dir, images=image_paths, timeout_seconds=min(CONFIG["role_timeout_seconds"]["reviewer"], reviewer_time))
    if review.get("status") != "ok":
        review_report = {"verdict": "blocked", "findings": [f"reviewer failed: {review.get('status')}"], "required_repairs": []}
    else:
        review_report = review["response"]
    write_json(cycle_dir / "review.json", review_report)

    repair_reserve = CONFIG["minimum_reviewer_seconds"] + CONFIG["minimum_integrator_seconds"]
    if review_report.get("verdict") == "revise" and CONFIG["max_repairs_per_cycle"] > 0 and budget_remaining() >= CONFIG["minimum_repair_seconds"] + repair_reserve:
        repair_sections = [
            f"Original plan:\n{json.dumps(plan, ensure_ascii=False, indent=2)}",
            f"Independent review findings:\n{json.dumps(review_report, ensure_ascii=False, indent=2)}",
            f"Changes so far:\n{candidate_diff['text_diff_for_review']}",
            "Make only the listed repairs within the original allowed paths. Do not start another feature.",
        ]
        repair_time = budget_remaining() - repair_reserve
        repair = invoke_role("repair", build_prompt("implementation", repair_sections), cycle_dir, timeout_seconds=min(CONFIG["role_timeout_seconds"]["repair"], repair_time))
        if repair.get("status") == "ok":
            implementation_report = repair["response"]
            write_json(cycle_dir / "repair.json", implementation_report)
            candidate_tree = snapshot_tree(cycle_dir, "post-repair")
            candidate_diff = tree_patch(baseline_tree, candidate_tree, cycle_dir, "post-repair.patch")
            changes_allowed, disallowed_path = changed_paths_allowed(candidate_diff["changed_paths"], plan["allowed_paths"])
            if changes_allowed and candidate_diff["patch_bytes"] <= 5_000_000:
                preview_restart = restart_preview_room()
                repaired_tree = candidate_tree
                candidate_tests = run_test_checks(plan, cycle_dir, "repaired", include_full_suite=True)
                candidate_browser = run_preview_browser_check(plan, cycle_dir, "repaired")
                candidate_tree = snapshot_tree(cycle_dir, "post-repair-checks")
                if candidate_tree != repaired_tree:
                    review_report = {"verdict": "reject", "findings": ["a repair test modified project files"], "required_repairs": []}
                    candidate_diff = tree_patch(baseline_tree, candidate_tree, cycle_dir, "post-repair-checks.patch")
                    test_summary.update({"repaired": candidate_tests, "repaired_browser": candidate_browser, "checkout_mutated_by_checks": True})
                    write_json(cycle_dir / "checks.json", test_summary)
                    image_paths = []
                    second_review = {"status": "skipped"}
                else:
                    candidate_diff = tree_patch(baseline_tree, candidate_tree, cycle_dir, "post-repair-checks.patch")
                    image_paths = select_image_pairs(cycle_dir / "baseline-browser", cycle_dir / "repaired-browser")
                    test_summary.update({"repaired": candidate_tests, "repaired_browser": candidate_browser, "preview_restart_after_repair": preview_restart})
                    test_summary["regression_gate"] = test_regression_gate(baseline_tests, candidate_tests)
                    write_json(cycle_dir / "checks.json", test_summary)
                    repair_review_sections = [
                        *review_sections,
                        f"Repair report:\n{json.dumps(implementation_report, ensure_ascii=False, indent=2)}",
                        f"Post-repair diff:\n{candidate_diff['text_diff_for_review']}",
                        f"Updated tests and evidence:\n{json.dumps(test_summary, ensure_ascii=False, indent=2)}",
                        "Review the repaired result from scratch. Images include the same original baseline and the repaired candidate.",
                    ]
                    reviewer_time = max(1, budget_remaining() - CONFIG["minimum_integrator_seconds"])
                    second_review = invoke_role("reviewer", build_prompt("review", repair_review_sections), cycle_dir, images=image_paths, timeout_seconds=min(CONFIG["role_timeout_seconds"]["reviewer"], reviewer_time))
                    review_report = second_review.get("response", {"verdict": "blocked", "findings": [f"second review failed: {second_review.get('status')}"], "required_repairs": []})
                    write_json(cycle_dir / "review-after-repair.json", review_report)
            else:
                review_report = {"verdict": "reject", "findings": [f"repair changed a path outside the plan: {disallowed_path}"], "required_repairs": []}
        else:
            review_report = {"verdict": "blocked", "findings": [f"repair role failed: {repair.get('status')}"], "required_repairs": []}

    visual_pair_available = len(image_paths) >= 2
    integration_sections = [
        f"Plan:\n{json.dumps(plan, ensure_ascii=False, indent=2)}",
        f"Implementation:\n{json.dumps(implementation_report, ensure_ascii=False, indent=2)}",
        f"Independent review:\n{json.dumps(review_report, ensure_ascii=False, indent=2)}",
        f"Checks:\n{json.dumps(test_summary, ensure_ascii=False, indent=2)}",
        f"Candidate paths and patch size:\n{json.dumps({'changed_paths': candidate_diff['changed_paths'], 'patch_bytes': candidate_diff['patch_bytes']}, ensure_ascii=False)}",
        f"Required visual/UX evidence available: {visual_pair_available if required_evidence & {'visual', 'ui_ux'} else 'not required'}",
        "A missing required evidence item or a failed test requires hold or rollback. Do not promote to production.",
    ]
    integrator = invoke_role("integrator", build_prompt("integration", integration_sections), cycle_dir)
    if integrator.get("status") == "ok":
        integration_report = integrator["response"]
    else:
        integration_report = {"decision": "hold", "summary": f"integrator failed: {integrator.get('status')}", "evidence_gaps": ["independent integration decision missing"], "next_goal": "retry after reviewing the failure"}
    write_json(cycle_dir / "integration.json", integration_report)

    candidate_tree_final = snapshot_tree(cycle_dir, "pre-decision")
    if candidate_tree_final != candidate_tree:
        integration_report["decision"] = "hold"
        integration_report["evidence_gaps"].append("checkout changed while the cycle was running")
    regression_gate = test_regression_gate(baseline_tests, candidate_tests)
    test_summary["regression_gate"] = regression_gate
    gates = regression_gate["passed"]
    if candidate_browser and candidate_browser["status"] != "passed":
        gates = False
    if preview_restart["status"] != "passed":
        gates = False
        integration_report.setdefault("evidence_gaps", []).append("the preview room could not be restarted to serve the candidate")
    if required_evidence & {"visual", "ui_ux"} and not visual_pair_available:
        gates = False
        integration_report["evidence_gaps"].append("matching before/after screenshots are missing")
    if "gameplay" in required_evidence and (not candidate_browser or candidate_browser["status"] != "passed"):
        gates = False
        integration_report["evidence_gaps"].append("the planned gameplay browser check did not pass")
    if review_report.get("verdict") != "accept":
        gates = False
    if not gates and integration_report.get("decision") == "accept":
        integration_report["decision"] = "hold"
        integration_report.setdefault("evidence_gaps", []).append("automated gate failed or independent review did not accept")

    if integration_report.get("decision") != "accept":
        rollback = rollback_tree(candidate_tree_final, baseline_tree, cycle_dir, plan["allowed_paths"])
        restore_preview = restart_preview_room() if rollback["rolled_back"] else {"status": "not_restarted", "detail": rollback["reason"]}
        result_status = "rolled_back" if rollback["rolled_back"] else "hold_external_changes"
        result = {
            "cycle_id": cycle_id, "status": result_status, "title": plan["title"], "goal": plan["goal"],
            "baseline_tree": baseline_tree, "candidate_tree": candidate_tree,
            "changed_paths": candidate_diff["changed_paths"], "review": review_report,
            "integration": integration_report, "checks": test_summary, "rollback": rollback,
            "restore_preview": restore_preview, "model_active_seconds": round(MODEL_ACTIVE_SECONDS),
            "finished_at": datetime.now(ZONE).isoformat(),
        }
        return append_result(cycle_dir, result)

    result = {
        "cycle_id": cycle_id, "status": "accepted_in_dev", "title": plan["title"], "goal": plan["goal"],
        "baseline_tree": baseline_tree, "candidate_tree": candidate_tree_final,
        "changed_paths": candidate_diff["changed_paths"], "review": review_report,
        "integration": integration_report, "checks": test_summary,
        "model_active_seconds": round(MODEL_ACTIVE_SECONDS),
        "finished_at": datetime.now(ZONE).isoformat(),
        "deployment": "left in the single /dev preview checkout; production was not touched",
    }
    return append_result(cycle_dir, result)


@contextmanager
def society_lock(blocking=False):
    ensure_state()
    lock_path = STATE / "runner.lock"
    with lock_path.open("a", encoding="utf-8") as lock:
        os.chmod(lock_path, 0o600)
        flags = fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB)
        try:
            fcntl.flock(lock, flags)
        except BlockingIOError:
            yield False
            return
        yield True


def sleep_until_budget_reset():
    seconds = int(BUDGET.until_reset_seconds())
    STOP_EVENT.wait(max(5, min(seconds, 3600)))


def daemon_loop():
    while not STOP_REQUESTED:
        remaining = budget_remaining()
        if remaining <= 0:
            sleep_until_budget_reset()
            continue
        if remaining < CONFIG["minimum_cycle_start_seconds"]:
            sleep_until_budget_reset()
            continue
        result = execute_cycle()
        print(json.dumps({"cycle_id": result.get("cycle_id"), "status": result.get("status"), "budget_remaining_seconds": budget_remaining()}, ensure_ascii=False), flush=True)
        if result.get("status") in {"blocked", "hold_external_changes"}:
            STOP_EVENT.wait(3600)
        else:
            STOP_EVENT.wait(CONFIG["idle_between_cycles_seconds"])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("preflight", help="check local tools and the single-checkout invariant without using the model")
    commands.add_parser("status", help="show current readiness and shared daily budget")
    commands.add_parser("once", help="run one bounded planning, implementation, review, and integration cycle")
    commands.add_parser("daemon", help="run continuous cycles within the shared daily active-time cap")
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)

    if args.command == "preflight":
        report = preflight()
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["ready"] else 1
    if args.command == "status":
        print(json.dumps({"preflight": preflight(), "latest": latest_report()}, ensure_ascii=False, indent=2))
        return 0
    if args.command == "once":
        with society_lock() as acquired:
            if not acquired:
                print(json.dumps({"status": "already_running"}))
                return 0
            report = execute_cycle()
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report.get("status") in {"accepted_in_dev", "no_change"} else 1
    if args.command == "daemon":
        with society_lock() as acquired:
            if not acquired:
                print(json.dumps({"status": "already_running"}))
                return 0
            try:
                daemon_loop()
            except KeyboardInterrupt:
                return 0
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
