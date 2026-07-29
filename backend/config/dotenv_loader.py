"""Local-development ``.env`` loader.

Populates :data:`os.environ` from a ``.env`` file when one is present, so
values such as ``ANTHROPIC_API_KEY`` (read at request time by
:mod:`apps.compliance.narration`) reach the process without a developer
having to export them by hand. This is intentionally its own module,
separate from :mod:`config.settings.local`, so the loading mechanism can be
unit-tested directly — Django settings modules are imported (and thus
executed) only once per process, which makes reimporting one mid-suite to
observe its side effects fragile.

Only :mod:`config.settings.local` calls this — :mod:`config.settings.production`
must keep relying solely on real, platform-injected environment variables
(Render sets these directly; there is no ``.env`` file in a production
deploy), so it never calls this loader.
"""

from pathlib import Path

import environ


def load_local_env(env_file: Path) -> None:
    """Load environment variables from ``env_file`` into ``os.environ``.

    A no-op if ``env_file`` does not exist. Never overrides a variable
    already present in ``os.environ`` — a value the developer explicitly
    exported in their shell always wins over the same key in the file.

    Args:
        env_file: Path to a ``.env``-style file (``KEY=value`` per line).
    """
    if not env_file.exists():
        return
    environ.Env.read_env(str(env_file))
