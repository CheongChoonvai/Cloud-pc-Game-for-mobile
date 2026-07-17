"""Virtual gamepad service: virtual Xbox 360 controller (ViGEmBus) with
keyboard/mouse fallback.

Ported from server/input/input_server.py, encapsulated as a service class so
the FastAPI WebSocket endpoint stays thin.
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Dict

from pynput.keyboard import Controller as KeyboardController, Key
from pynput.mouse import Controller as MouseController

from app.core.config import settings

logger = logging.getLogger("input.gamepad")

try:
    import vgamepad as vg

    VGAMEPAD_AVAILABLE = True
except Exception:
    VGAMEPAD_AVAILABLE = False
    logger.warning("vgamepad not available - keyboard fallback only")

KEYBOARD_SPECIAL_KEYS = {
    "SPACE": Key.space,
    "SHIFT": Key.shift,
    "CTRL": Key.ctrl,
    "ALT": Key.alt,
    "ENTER": Key.enter,
    "ESC": Key.esc,
    "TAB": Key.tab,
    "BACKSPACE": Key.backspace,
    "UP": Key.up,
    "DOWN": Key.down,
    "LEFT": Key.left,
    "RIGHT": Key.right,
}

# App button name -> keyboard key when running in fallback mode
BUTTON_KEYBOARD_MAP = {
    "A": "SPACE",
    "B": "SHIFT",
    "X": "E",
    "Y": "Q",
    "LB": "R",
    "RB": "F",
    "LT": "1",
    "RT": "2",
    "START": "ENTER",
    "SELECT": "ESC",
    "D_UP": "UP",
    "D_DOWN": "DOWN",
    "D_LEFT": "LEFT",
    "D_RIGHT": "RIGHT",
}

DPAD_TO_BUTTON = {
    "up": "D_UP",
    "down": "D_DOWN",
    "left": "D_LEFT",
    "right": "D_RIGHT",
}


class GamepadService:
    """Applies controller input messages to a virtual gamepad / keyboard / mouse."""

    def __init__(self) -> None:
        self.mouse = MouseController()
        self.keyboard = KeyboardController()
        self.keyboard_keys_down: set = set()
        self.gamepad = None
        self.left_stick: Dict[str, float] = {"x": 0.0, "y": 0.0}
        self.right_stick: Dict[str, float] = {"x": 0.0, "y": 0.0}
        self.mouse_sensitivity = settings.mouse_sensitivity
        self._update_thread: threading.Thread = None
        self._running = False

        self.button_map = {}
        if VGAMEPAD_AVAILABLE:
            self.button_map = {
                "A": vg.XUSB_BUTTON.XUSB_GAMEPAD_A,
                "B": vg.XUSB_BUTTON.XUSB_GAMEPAD_B,
                "X": vg.XUSB_BUTTON.XUSB_GAMEPAD_X,
                "Y": vg.XUSB_BUTTON.XUSB_GAMEPAD_Y,
                "LB": vg.XUSB_BUTTON.XUSB_GAMEPAD_LEFT_SHOULDER,
                "RB": vg.XUSB_BUTTON.XUSB_GAMEPAD_RIGHT_SHOULDER,
                "START": vg.XUSB_BUTTON.XUSB_GAMEPAD_START,
                "SELECT": vg.XUSB_BUTTON.XUSB_GAMEPAD_BACK,
                "D_UP": vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_UP,
                "D_DOWN": vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_DOWN,
                "D_LEFT": vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_LEFT,
                "D_RIGHT": vg.XUSB_BUTTON.XUSB_GAMEPAD_DPAD_RIGHT,
            }

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    def start(self) -> None:
        if VGAMEPAD_AVAILABLE and settings.input_mode != "keyboard":
            try:
                self.gamepad = vg.VX360Gamepad()
                logger.info("Virtual Xbox 360 controller initialized")
            except Exception as exc:
                logger.warning(
                    "Failed to create virtual gamepad (%s). "
                    "Install ViGEmBus: https://github.com/ViGEm/ViGEmBus/releases",
                    exc,
                )
                self.gamepad = None

        self._running = True
        self._update_thread = threading.Thread(target=self._update_loop, daemon=True)
        self._update_thread.start()

    def stop(self) -> None:
        self._running = False
        self.reset()

    @property
    def controller_mode(self) -> str:
        return "xinput" if self.gamepad is not None else "keyboard"

    @property
    def keyboard_fallback(self) -> bool:
        return settings.input_mode in ("keyboard", "both") or self.gamepad is None

    # ------------------------------------------------------------------
    # Continuous updates (sticks -> gamepad + mouse) at ~60 Hz
    # ------------------------------------------------------------------
    def _update_loop(self) -> None:
        while self._running:
            if self.gamepad is not None:
                try:
                    self.gamepad.left_joystick_float(
                        x_value_float=self.left_stick["x"],
                        y_value_float=self.left_stick["y"],
                    )
                    self.gamepad.right_joystick_float(
                        x_value_float=self.right_stick["x"],
                        y_value_float=self.right_stick["y"],
                    )
                    self.gamepad.update()
                except Exception as exc:
                    logger.error("Gamepad update error: %s", exc)

            # Mouse fallback for camera (works even without ViGEmBus)
            if self.right_stick["x"] != 0 or self.right_stick["y"] != 0:
                dx = int(self.right_stick["x"] * self.mouse_sensitivity)
                dy = int(self.right_stick["y"] * self.mouse_sensitivity)
                if dx != 0 or dy != 0:
                    self.mouse.move(dx, dy)

            time.sleep(0.016)

    # ------------------------------------------------------------------
    # Keyboard helpers
    # ------------------------------------------------------------------
    def _keyboard_key(self, name: str):
        return KEYBOARD_SPECIAL_KEYS.get(name.upper(), name.lower())

    def _set_keyboard_key(self, name: str, pressed: bool) -> None:
        key_name = name.upper()
        key = self._keyboard_key(key_name)
        if pressed and key_name not in self.keyboard_keys_down:
            self.keyboard.press(key)
            self.keyboard_keys_down.add(key_name)
        elif not pressed and key_name in self.keyboard_keys_down:
            self.keyboard.release(key)
            self.keyboard_keys_down.discard(key_name)

    def _release_all_keys(self) -> None:
        for key_name in list(self.keyboard_keys_down):
            try:
                self.keyboard.release(self._keyboard_key(key_name))
            except Exception:
                pass
        self.keyboard_keys_down.clear()

    # ------------------------------------------------------------------
    # Input message handlers (protocol shared with the frontend)
    # ------------------------------------------------------------------
    def handle_left_stick(self, x: float, y: float) -> None:
        self.left_stick["x"] = max(-1.0, min(1.0, x))
        self.left_stick["y"] = max(-1.0, min(1.0, -y))  # invert Y: up = forward
        if self.keyboard_fallback:
            threshold, release = 0.35, 0.2
            self._set_keyboard_key("W", self.left_stick["y"] > threshold)
            self._set_keyboard_key("S", self.left_stick["y"] < -threshold)
            self._set_keyboard_key("A", self.left_stick["x"] < -threshold)
            self._set_keyboard_key("D", self.left_stick["x"] > threshold)
            if abs(self.left_stick["y"]) < release:
                self._set_keyboard_key("W", False)
                self._set_keyboard_key("S", False)
            if abs(self.left_stick["x"]) < release:
                self._set_keyboard_key("A", False)
                self._set_keyboard_key("D", False)

    def handle_right_stick(self, x: float, y: float) -> None:
        self.right_stick["x"] = max(-1.0, min(1.0, x))
        self.right_stick["y"] = max(-1.0, min(1.0, y))

    def handle_button(self, button: str, pressed: bool) -> None:
        if self.keyboard_fallback:
            key_name = BUTTON_KEYBOARD_MAP.get(button)
            if key_name:
                self._set_keyboard_key(key_name, pressed)
            return

        if button == "LT":
            self.gamepad.left_trigger(value=255 if pressed else 0)
            self.gamepad.update()
            return
        if button == "RT":
            self.gamepad.right_trigger(value=255 if pressed else 0)
            self.gamepad.update()
            return

        xbox_button = self.button_map.get(button)
        if xbox_button is not None:
            if pressed:
                self.gamepad.press_button(button=xbox_button)
            else:
                self.gamepad.release_button(button=xbox_button)
            self.gamepad.update()

    def handle_dpad(self, direction: str, pressed: bool) -> None:
        button = DPAD_TO_BUTTON.get(direction.lower())
        if button:
            self.handle_button(button, pressed)

    def set_sensitivity(self, value) -> int:
        """Set camera/mouse sensitivity at runtime (clamped 1-100)."""
        try:
            sensitivity = int(value)
        except (TypeError, ValueError):
            return self.mouse_sensitivity
        self.mouse_sensitivity = max(1, min(100, sensitivity))
        logger.info("Mouse sensitivity set to %d", self.mouse_sensitivity)
        return self.mouse_sensitivity

    def reset(self) -> None:
        """Return everything to neutral (called on client disconnect)."""
        self.left_stick = {"x": 0.0, "y": 0.0}
        self.right_stick = {"x": 0.0, "y": 0.0}
        self._release_all_keys()
        if self.gamepad is not None:
            self.gamepad.reset()
            self.gamepad.update()


gamepad_service = GamepadService()
