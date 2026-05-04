import json
from pathlib import Path


def test_frontend_has_production_build_script() -> None:
    package = json.loads(Path("frontend/package.json").read_text(encoding="utf-8"))

    assert package["scripts"]["build"] == "tsc -b && vite build"
