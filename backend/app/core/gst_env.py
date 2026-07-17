"""Prepare the process environment so PyGObject (gi) can find GStreamer DLLs.

Must be imported BEFORE any `import gi` happens anywhere in the app.
Replaces the manual `$env:PYGI_DLL_DIRS` / `$env:PATH` steps from the old
RUN_SERVICES.md flow.
"""
import os
import sys

from app.core.config import settings

_configured = False


def configure_gstreamer_env() -> None:
    global _configured
    if _configured:
        return
    _configured = True

    gst_bin = settings.gstreamer_bin
    if not gst_bin or not os.path.isdir(gst_bin):
        return

    os.environ.setdefault("PYGI_DLL_DIRS", gst_bin)
    if gst_bin not in os.environ.get("PATH", ""):
        os.environ["PATH"] = gst_bin + os.pathsep + os.environ.get("PATH", "")

    if sys.platform == "win32" and hasattr(os, "add_dll_directory"):
        try:
            os.add_dll_directory(gst_bin)
        except OSError:
            pass
