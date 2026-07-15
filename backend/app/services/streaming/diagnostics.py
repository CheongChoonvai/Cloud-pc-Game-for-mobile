"""GStreamer availability and plugin diagnostics."""
from __future__ import annotations

import os
import shutil
import subprocess
from typing import Dict, List, Optional, Tuple

from app.core.gst_env import configure_gstreamer_env

configure_gstreamer_env()

try:
    import gi

    gi.require_version("Gst", "1.0")
    from gi.repository import Gst

    GSTREAMER_AVAILABLE = True
    GSTREAMER_IMPORT_ERROR: Optional[str] = None
except Exception as exc:  # pragma: no cover - depends on host install
    GSTREAMER_AVAILABLE = False
    GSTREAMER_IMPORT_ERROR = str(exc)

# Elements required by the D3D11 capture -> x264enc -> webrtcbin pipeline
REQUIRED_ELEMENTS: List[str] = [
    "d3d11screencapturesrc",
    "d3d11convert",
    "d3d11download",
    "videoconvert",
    "x264enc",
    "h264parse",
    "rtph264pay",
    "webrtcbin",
]


def ensure_gstreamer_initialized() -> bool:
    if not GSTREAMER_AVAILABLE:
        return False
    if not Gst.is_initialized():
        Gst.init(None)
    return True


def _find_gst_inspect() -> Optional[str]:
    from app.core.config import settings

    candidates = [
        os.path.join(settings.gstreamer_bin, "gst-inspect-1.0.exe"),
        shutil.which("gst-inspect-1.0"),
        shutil.which("gst-inspect-1.0.exe"),
    ]
    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return candidate
    return None


def _inspect_element(gst_inspect: str, element: str) -> Tuple[bool, str]:
    try:
        result = subprocess.run(
            [gst_inspect, element], capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            first = result.stdout.strip().splitlines()
            return True, first[0] if first else ""
        return False, f"gst-inspect-1.0 returned {result.returncode}"
    except Exception as exc:
        return False, f"error: {exc}"


def check_plugins() -> Dict:
    """Return availability report for gi import + required pipeline elements."""
    report: Dict = {
        "gstreamer_available": GSTREAMER_AVAILABLE,
        "import_error": GSTREAMER_IMPORT_ERROR,
        "elements": {},
        "all_required_present": False,
    }

    gst_inspect = _find_gst_inspect()
    if not gst_inspect:
        report["import_error"] = report["import_error"] or "gst-inspect-1.0 not found"
        return report

    all_present = True
    for element in REQUIRED_ELEMENTS:
        found, info = _inspect_element(gst_inspect, element)
        report["elements"][element] = {"available": found, "info": info}
        if not found:
            all_present = False

    report["all_required_present"] = all_present
    return report


def print_plugin_report(report: Optional[Dict] = None) -> None:
    if report is None:
        report = check_plugins()

    print("=" * 60)
    print("  GStreamer Plugin Diagnostic Report")
    print("=" * 60)
    if not report["gstreamer_available"]:
        print(f"  PyGObject/GStreamer import FAILED: {report['import_error']}")
    else:
        print("  PyGObject/GStreamer import: OK")
    for name, info in report["elements"].items():
        symbol = "+" if info["available"] else "x"
        print(f"    [{symbol}] {name}")
    print("-" * 60)
    if report["all_required_present"]:
        print("  Result: ALL REQUIRED PLUGINS AVAILABLE")
    else:
        print("  Result: SOME REQUIRED PLUGINS MISSING")
    print("=" * 60)


if __name__ == "__main__":
    print_plugin_report()
