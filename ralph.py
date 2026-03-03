#!/usr/bin/env python3
"""
Plan Orchestration Script
Runs Claude Code agents sequentially for each plan:
  1. Implement agent - validates plan, implements, builds, commits
  2. Review agent - reviews last commit, writes structured JSON to a known file
  3. Fix agent (conditional) - only if review JSON exists and is_approved is false
"""

import subprocess
import json
import sys
import os
from pathlib import Path
from datetime import datetime

# ============================================================
# PLANS - Add absolute paths to your plan files here
# ============================================================
FIX_PLANS_DIR = "/home/hassan/webDev/pomodorocli/tmp_reports/review-27-feb/fix-plans"

PLANS = [
    # === Tier 1: Fix Now (data loss / security / correctness) ===
    f"{FIX_PLANS_DIR}/D2-post-dispose-leak.md",          # Smallest, no deps
    f"{FIX_PLANS_DIR}/B5-cli-command-validation.md",      # Small, isolated
    f"{FIX_PLANS_DIR}/B1-daemon-command-validation.md",   # New file, no conflicts
    f"{FIX_PLANS_DIR}/D1-timer-drift.md",                 # timer-engine.ts only
    f"{FIX_PLANS_DIR}/B2-B3-export-import-safety.md",     # data.ts only
    f"{FIX_PLANS_DIR}/A1-session-race-condition.md",      # store.ts (big change, do last in tier)

    # === Tier 2: Fix Soon (reliability / performance) ===
    f"{FIX_PLANS_DIR}/A2-non-atomic-writes.md",           # After A1 (shares store.ts)
    f"{FIX_PLANS_DIR}/D3-duplicate-daemon-race.md",       # server.ts
    f"{FIX_PLANS_DIR}/G1-useMemo-side-effects.md",        # Small, 2 files
    f"{FIX_PLANS_DIR}/G2-useInput-textInput-conflicts.md", # Small, 3 files
    f"{FIX_PLANS_DIR}/C1-session-loading-performance.md", # After A1 (store.ts cache)
    f"{FIX_PLANS_DIR}/C2-C3-react-memo-memoize.md",      # useDaemonConnection + components

    # === Tier 3: Improve (maintainability / DRY) ===
    f"{FIX_PLANS_DIR}/J1-J2-J3-dead-code-removal.md",    # Remove first, less to refactor
    f"{FIX_PLANS_DIR}/F1-extract-fs-utils.md",            # Foundation for other modules
    f"{FIX_PLANS_DIR}/F2-extract-format-utils.md",
    f"{FIX_PLANS_DIR}/I1-config-validation.md",
    f"{FIX_PLANS_DIR}/E1-E2-decompose-large-views.md",
    f"{FIX_PLANS_DIR}/E3-E8-decompose-remaining.md",

    # === Tier 4: Polish ===
    f"{FIX_PLANS_DIR}/F3-F6-remaining-dry.md",
    f"{FIX_PLANS_DIR}/G5-G6-minor-react-patterns.md",
    f"{FIX_PLANS_DIR}/I3-as-any-cleanup.md",
    f"{FIX_PLANS_DIR}/H1-H6-daemon-robustness.md",
    f"{FIX_PLANS_DIR}/B4-B6-B9-remaining-security.md",
    f"{FIX_PLANS_DIR}/I2-I4-I5-type-config-fixes.md",
]

# ============================================================
# CONFIG
# ============================================================
PROJECT_DIR = "/home/hassan/webDev/pomodorocli"
REVIEW_DIR = os.path.join(PROJECT_DIR, ".reviews")
LOG_DIR = os.path.join(PROJECT_DIR, ".agent-logs")
BUILD_CMD = "npm run build"


def ensure_dirs():
    os.makedirs(REVIEW_DIR, exist_ok=True)
    os.makedirs(LOG_DIR, exist_ok=True)


def run_claude(prompt: str, plan_name: str, agent_name: str) -> str:
    """Run claude code with a prompt and return stdout."""
    log_file = os.path.join(
        LOG_DIR, f"{plan_name}_{agent_name}_{datetime.now():%Y%m%d_%H%M%S}.log"
    )

    print(f"\n{'='*60}")
    print(f"  Running {agent_name} agent for: {plan_name}")
    print(f"{'='*60}\n")

    result = subprocess.run(
        [
            "claude", "-p",
            "--model", "opus",
            "--output-format", "text",
            "--dangerously-skip-permissions",
            prompt,
        ],
        cwd=PROJECT_DIR,
        capture_output=True,
        text=True,
    )

    output = result.stdout + "\n--- STDERR ---\n" + result.stderr
    Path(log_file).write_text(output)

    if result.returncode != 0:
        print(f"  ⚠ Claude exited with code {result.returncode}")
        print(f"  Log: {log_file}")

    return result.stdout


def plan_name_from_path(plan_path: str) -> str:
    return Path(plan_path).stem


def review_json_path(plan_name: str) -> str:
    return os.path.join(REVIEW_DIR, f"{plan_name}.review.json")


# ============================================================
# AGENT PROMPTS
# ============================================================


def build_implement_prompt(plan_path: str, plan_name: str) -> str:
    return f"""You are the IMPLEMENTATION agent. Your job is to implement a plan.

## Plan file
Read the plan at: {plan_path}

## Project info
- Build command: `{BUILD_CMD}`
- Source code is in: `source/`

## Instructions

1. **Validate the plan first.** Check if the plan references files or code that has
   changed since the plan was written. If the plan is no longer applicable as-is:
   - Update the plan file ({plan_path}) with necessary adjustments
   - Add a section "## Plan Adjustments" at the bottom noting what changed and why

2. **Implement the plan.** Follow the plan step by step. Write clean code.

3. **Build/check for errors.** Run `{BUILD_CMD}` and fix any errors until the build
   passes cleanly.

4. **Commit ONLY source code changes.** Stage only files under `source/` (and the plan
   file if you modified it). Do NOT use `git add -A` or `git add .`.
   Instead: `git add source/ && git commit -m "feat: implement {plan_name}"`
   If you modified the plan file, also add it explicitly.

IMPORTANT: Do NOT stage or commit files outside `source/` (no .reviews, .agent-logs, tmp_reports, etc).
"""


def build_review_prompt(
    plan_path: str, plan_name: str, review_file: str
) -> str:
    return f"""You are the REVIEW agent. Your job is to review the last commit.

## Plan file
The original plan is at: {plan_path}

## Instructions

1. Look at the last commit: run `git diff HEAD~1 HEAD` and `git log -1`
2. Review the changes against the plan. Check for:
   - Correctness and completeness
   - Edge cases and error handling
   - Code style and best practices
   - Security issues
   - Missing tests if applicable
   - Any deviations from the plan that seem wrong

3. **Write your review as a JSON file** to exactly this path:
   {review_file}

   The JSON must have this exact structure:
   {{
     "is_approved": true or false,
     "findings": [
       {{
         "level": "critical" or "warning",
         "description": "what the issue is and where"
       }}
     ]
   }}

   - Set `is_approved` to true if the code is good to ship.
   - Set `is_approved` to false if there are critical issues that must be fixed.
   - Include all findings regardless of approval status.

IMPORTANT:
- You MUST write the JSON file to {review_file}. This is your primary deliverable.
- Do NOT commit anything. Do NOT modify any source code.
- Only write the single review JSON file, nothing else.
"""


def build_fix_prompt(plan_path: str, plan_name: str, findings: list) -> str:
    findings_text = json.dumps(findings, indent=2)

    return f"""You are the FIX agent. Your job is to fix issues found during code review.

## Plan file
The original plan is at: {plan_path}

## Project info
- Build command: `{BUILD_CMD}`

## Review Findings to Fix
{findings_text}

## Instructions

1. Address ALL critical findings. Address warnings if they are straightforward.
2. Run `{BUILD_CMD}` and fix any errors until it passes.
3. Commit ONLY source code changes:
   `git add source/ && git commit -m "fix: address review findings for {plan_name}"`

IMPORTANT: Do NOT stage or commit files outside `source/`. Do NOT use `git add -A`.
"""


def read_review(review_file: str) -> dict | None:
    """Read and parse the review JSON file."""
    if not os.path.exists(review_file):
        return None
    try:
        data = json.loads(Path(review_file).read_text())
        if "is_approved" in data:
            return data
        print(f"  ⚠ Review JSON missing 'is_approved' field")
        return None
    except json.JSONDecodeError as e:
        print(f"  ⚠ Failed to parse review JSON: {e}")
        return None


# ============================================================
# MAIN ORCHESTRATION
# ============================================================


def process_plan(plan_path: str) -> dict:
    """Process a single plan through all agents."""
    plan_name = plan_name_from_path(plan_path)
    review_file = review_json_path(plan_name)
    result = {"plan": plan_path, "status": "unknown", "review": None}

    if not os.path.exists(plan_path):
        print(f"  ✗ Plan file not found: {plan_path}")
        result["status"] = "error_not_found"
        return result

    # Clean up any previous review for this plan
    if os.path.exists(review_file):
        os.remove(review_file)

    # --- STEP 1: Implement ---
    run_claude(
        build_implement_prompt(plan_path, plan_name), plan_name, "implement"
    )
    print("  ✓ Implementation complete")

    # --- STEP 2: Review ---
    run_claude(
        build_review_prompt(plan_path, plan_name, review_file),
        plan_name,
        "review",
    )

    review = read_review(review_file)

    if review is None:
        print("  ✗ Review agent did not produce a valid JSON file.")
        print(f"    Expected at: {review_file}")
        result["status"] = "error_no_review"
        return result

    result["review"] = review
    critical = [f for f in review.get("findings", []) if f.get("level") == "critical"]
    warnings = [f for f in review.get("findings", []) if f.get("level") == "warning"]

    if review["is_approved"]:
        print(f"  ✓ Review approved! ({len(warnings)} warnings)")
        result["status"] = "approved"
        return result

    print(f"  ✗ Review not approved: {len(critical)} critical, {len(warnings)} warnings")

    # --- STEP 3: Fix ---
    run_claude(
        build_fix_prompt(plan_path, plan_name, review["findings"]),
        plan_name,
        "fix",
    )
    print("  ✓ Fixes applied")
    result["status"] = "fixed"

    return result


def main():
    if not PLANS:
        print("No plans configured! Edit the PLANS array in this script.")
        sys.exit(1)

    ensure_dirs()

    print(f"\n{'#'*60}")
    print(f"  Plan Orchestrator - {len(PLANS)} plans to process")
    print(f"  Project: {PROJECT_DIR}")
    print(f"{'#'*60}")

    results = []
    for i, plan_path in enumerate(PLANS, 1):
        print(f"\n\n{'*'*60}")
        print(f"  Plan {i}/{len(PLANS)}: {Path(plan_path).name}")
        print(f"{'*'*60}")

        result = process_plan(plan_path)
        results.append(result)

    # --- Summary ---
    print(f"\n\n{'='*60}")
    print("  SUMMARY")
    print(f"{'='*60}")
    for r in results:
        name = Path(r["plan"]).name
        status = r["status"]
        icon = {
            "approved": "✓",
            "fixed": "🔧",
            "error_not_found": "✗",
            "error_implement": "✗",
            "error_no_review": "✗",
        }.get(status, "?")
        review_info = ""
        if r["review"]:
            findings = r["review"].get("findings", [])
            if findings:
                review_info = f" ({len(findings)} findings)"
        print(f"  {icon} {name}: {status}{review_info}")

    summary_path = os.path.join(
        LOG_DIR, f"summary_{datetime.now():%Y%m%d_%H%M%S}.json"
    )
    Path(summary_path).write_text(json.dumps(results, indent=2))
    print(f"\n  Summary saved to: {summary_path}")


if __name__ == "__main__":
    main()
