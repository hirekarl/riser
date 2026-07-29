"""Tests for the local-development ``.env`` loader (:mod:`config.dotenv_loader`).

Exercises the loading mechanism directly rather than reimporting
``config.settings.local`` — Django settings modules only execute once per
process, so reimporting them mid-suite to test side effects is fragile.
"""

import os
from collections.abc import Iterator
from pathlib import Path

import pytest

from config.dotenv_loader import load_local_env


@pytest.fixture
def clean_environ() -> Iterator[dict[str, str]]:
    """Snapshot ``os.environ`` and restore it exactly after the test.

    Prevents a test-written variable from leaking into other tests, which
    run in the same process.
    """
    original = dict(os.environ)
    yield original
    os.environ.clear()
    os.environ.update(original)


class TestLoadLocalEnv:
    """Tests for :func:`config.dotenv_loader.load_local_env`."""

    def test_loads_variable_from_env_file_into_os_environ(
        self, tmp_path: Path, clean_environ: dict[str, str]
    ) -> None:
        """A variable defined only in the file lands in ``os.environ``."""
        os.environ.pop("RISER_TEST_DOTENV_VAR", None)
        env_file = tmp_path / ".env"
        env_file.write_text("RISER_TEST_DOTENV_VAR=from-dotenv-file\n")

        load_local_env(env_file)

        assert os.environ["RISER_TEST_DOTENV_VAR"] == "from-dotenv-file"

    def test_does_not_override_an_already_exported_shell_variable(
        self, tmp_path: Path, clean_environ: dict[str, str]
    ) -> None:
        """A value already exported in the shell wins over the same key in the file."""
        os.environ["RISER_TEST_DOTENV_VAR"] = "from-shell"
        env_file = tmp_path / ".env"
        env_file.write_text("RISER_TEST_DOTENV_VAR=from-dotenv-file\n")

        load_local_env(env_file)

        assert os.environ["RISER_TEST_DOTENV_VAR"] == "from-shell"

    def test_missing_env_file_is_a_silent_no_op(
        self, tmp_path: Path, clean_environ: dict[str, str]
    ) -> None:
        """A missing ``.env`` file does not raise and leaves the environment untouched."""
        os.environ.pop("RISER_TEST_DOTENV_VAR", None)
        missing_file = tmp_path / "does-not-exist.env"

        load_local_env(missing_file)

        assert "RISER_TEST_DOTENV_VAR" not in os.environ
