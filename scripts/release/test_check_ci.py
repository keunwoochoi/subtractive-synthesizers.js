#!/usr/bin/env python3
"""Prove release readiness binds CI success to ci.yml and the exact HEAD.

The fake GitHub wrapper behaves like the production boundary: with the required
workflow filter it returns the ci.yml run, while an unfiltered query would return a
successful Pages run. This makes the old false-pass reproducible without network access.

    python3 scripts/release/test_check_ci.py
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import textwrap
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CHECK_CI = ROOT / "scripts/audit/check-ci.sh"
RELEASE_CHECK = ROOT / "scripts/release/check-release-ready.sh"


def clean_git_environment() -> dict[str, str]:
    """Do not let a parent git hook redirect fixture commands into the real index."""
    return {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}


def repository_snapshot(
    root: Path = ROOT, env: dict[str, str] | None = None
) -> dict[str, tuple[int, str]]:
    """Capture every persistent Git surface the fixture could have changed."""
    env = env or clean_git_environment()

    def git(*args: str) -> tuple[int, str]:
        result = subprocess.run(
            ["git", *args],
            cwd=root,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        # Absence is state too: clean CI clones need not configure user.name/email.
        return result.returncode, result.stdout

    return {
        "config": git("config", "--local", "--null", "--list", "--show-origin"),
        "user.name": git("config", "user.name"),
        "user.email": git("config", "user.email"),
        "bare": git("rev-parse", "--is-bare-repository"),
        "head": git("rev-parse", "HEAD"),
        "refs": git("show-ref"),
        "remotes": git("remote", "-v"),
        "status": git("status", "--porcelain=v1", "--untracked-files=all"),
    }


class CiGateFixture:
    def __init__(self) -> None:
        self.temp = tempfile.TemporaryDirectory(prefix="subsynth-ci-gate-")
        self.root = Path(self.temp.name)
        self.git_env = clean_git_environment()
        (self.root / "scripts/audit").mkdir(parents=True)
        shutil.copy2(CHECK_CI, self.root / "scripts/audit/check-ci.sh")
        self.log = self.root / "gh-args.log"
        wrapper = self.root / "scripts/gh-owner.sh"
        wrapper.write_text(
            textwrap.dedent(
                """\
                #!/usr/bin/env python3
                import json
                import os
                import sys
                from pathlib import Path

                args = sys.argv[1:]
                Path(os.environ["GH_ARGS_LOG"]).write_text(json.dumps(args))
                if os.environ.get("GH_QUERY_FAIL") == "1":
                    raise SystemExit(1)
                if "--workflow" in args and args[args.index("--workflow") + 1] == "ci.yml":
                    state = json.loads(os.environ.get("CI_RUN", "null"))
                else:
                    state = json.loads(os.environ["PAGES_RUN"])
                if state is not None:
                    print(json.dumps(state))
                """
            ),
            encoding="utf-8",
        )
        wrapper.chmod(0o755)
        subprocess.run(["git", "init", "-q", "-b", "main"], cwd=self.root, env=self.git_env, check=True)
        (self.root / "fixture.txt").write_text("fixture\n", encoding="utf-8")
        subprocess.run(["git", "add", "."], cwd=self.root, env=self.git_env, check=True)
        # Identity is command-local. Persisting it with `git config` once escaped this
        # fixture under pre-commit and changed the owning repository's next commit.
        subprocess.run(
            [
                "git",
                "-c",
                "user.name=CI Gate Test",
                "-c",
                "user.email=ci-gate@example.invalid",
                "commit",
                "-qm",
                "fixture",
            ],
            cwd=self.root,
            env=self.git_env,
            check=True,
        )
        self.sha = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=self.root, env=self.git_env, text=True
        ).strip()
        self.upstream = self.root / "upstream.git"
        subprocess.run(["git", "init", "-q", "--bare", self.upstream], env=self.git_env, check=True)
        subprocess.run(
            ["git", "remote", "add", "origin", str(self.upstream)],
            cwd=self.root,
            env=self.git_env,
            check=True,
        )
        subprocess.run(
            ["git", "push", "-qu", "origin", "main"],
            cwd=self.root,
            env=self.git_env,
            check=True,
        )

    def run(self, ci_run: dict[str, object] | None, **extra: str) -> subprocess.CompletedProcess[str]:
        pages = {
            "headSha": self.sha,
            "status": "completed",
            "conclusion": "success",
            "workflowName": "pages-build-deployment",
            "url": "https://example.invalid/pages",
        }
        env = {
            **self.git_env,
            "GH_ARGS_LOG": str(self.log),
            "PAGES_RUN": json.dumps(pages),
            "CI_RUN": json.dumps(ci_run),
            **extra,
        }
        return subprocess.run(
            ["scripts/audit/check-ci.sh", "--require-green"],
            cwd=self.root,
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )

    def close(self) -> None:
        self.temp.cleanup()


class TestReleaseCiGate(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture = CiGateFixture()

    def tearDown(self) -> None:
        self.fixture.close()

    def ci_run(self, status: str, conclusion: str | None) -> dict[str, object]:
        return {
            "headSha": self.fixture.sha,
            "status": status,
            "conclusion": conclusion,
            "workflowName": "ci",
            "url": "https://example.invalid/ci",
        }

    def test_completed_success_at_exact_head_passes(self) -> None:
        result = self.fixture.run(self.ci_run("completed", "success"))
        self.assertEqual(result.returncode, 0, result.stdout)
        self.assertIn("status=completed conclusion=success", result.stdout)
        args = json.loads(self.fixture.log.read_text(encoding="utf-8"))
        self.assertIn("--workflow", args)
        self.assertEqual(args[args.index("--workflow") + 1], "ci.yml")
        self.assertIn("--commit", args)
        self.assertEqual(args[args.index("--commit") + 1], self.fixture.sha)

    def test_pages_success_cannot_mask_red_or_in_progress_ci(self) -> None:
        for status, conclusion in (("completed", "failure"), ("in_progress", None)):
            with self.subTest(status=status, conclusion=conclusion):
                result = self.fixture.run(self.ci_run(status, conclusion))
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertIn(f"status={status}", result.stdout)
                self.assertIn(f"conclusion={conclusion or '-'}", result.stdout)
                self.assertNotIn("pages-build-deployment", result.stdout)

    def test_every_non_success_state_fails_with_observed_state(self) -> None:
        for status, conclusion in (
            ("queued", None),
            ("in_progress", None),
            ("completed", "cancelled"),
            ("completed", "failure"),
        ):
            with self.subTest(status=status, conclusion=conclusion):
                result = self.fixture.run(self.ci_run(status, conclusion))
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertIn(f"status={status}", result.stdout)
                self.assertIn(f"conclusion={conclusion or '-'}", result.stdout)

    def test_missing_run_and_wrong_sha_fail_closed(self) -> None:
        missing = self.fixture.run(None)
        self.assertNotEqual(missing.returncode, 0, missing.stdout)
        self.assertIn("no run found", missing.stdout)

        wrong = self.ci_run("completed", "success")
        wrong["headSha"] = "0" * 40
        mismatch = self.fixture.run(wrong)
        self.assertNotEqual(mismatch.returncode, 0, mismatch.stdout)
        self.assertIn("headSha=" + "0" * 40, mismatch.stdout)

    def test_query_failure_fails_closed(self) -> None:
        result = self.fixture.run(self.ci_run("completed", "success"), GH_QUERY_FAIL="1")
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn("query failed", result.stdout)

    def test_release_readiness_uses_strict_mode(self) -> None:
        text = RELEASE_CHECK.read_text(encoding="utf-8")
        self.assertIn("scripts/audit/check-ci.sh --require-green", text)


class TestFixtureIsolation(unittest.TestCase):
    def test_fixture_leaves_repository_identity_config_and_state_unchanged(self) -> None:
        before = repository_snapshot()
        fixture = CiGateFixture()
        try:
            result = fixture.run(
                {
                    "headSha": fixture.sha,
                    "status": "completed",
                    "conclusion": "success",
                    "workflowName": "ci",
                    "url": "https://example.invalid/ci",
                }
            )
            self.assertEqual(result.returncode, 0, result.stdout)

            local_identity = subprocess.run(
                ["git", "config", "--local", "--get-regexp", "^user\\."],
                cwd=fixture.root,
                env=fixture.git_env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            )
            self.assertEqual(local_identity.returncode, 1, local_identity.stdout)
            self.assertEqual(local_identity.stdout, "")

            empty_home = fixture.root / "empty-home"
            empty_home.mkdir()
            no_identity_env = {
                **fixture.git_env,
                "HOME": str(empty_home),
                "XDG_CONFIG_HOME": str(empty_home),
            }
            identity_free = repository_snapshot(fixture.root, no_identity_env)
            self.assertEqual(identity_free["user.name"], (1, ""))
            self.assertEqual(identity_free["user.email"], (1, ""))
        finally:
            fixture.close()

        self.assertEqual(repository_snapshot(), before)


if __name__ == "__main__":
    unittest.main()
