"""Unit tests for the new os_layer functions: restart/shutdown, media keys,
brightness, and idle-time reporting. All OS calls are mocked — these never
actually restart/shut down the test machine or change its brightness."""
import ctypes
from unittest import mock

from agent.os_layer import windows as win


# ── restart / shutdown ──────────────────────────────────────────────────────

def test_restart_system_calls_shutdown_r():
    with mock.patch.object(win.subprocess, "run") as run:
        run.return_value = mock.Mock(returncode=0)
        result = win.restart_system()
    assert result["ok"] is True
    run.assert_called_once()
    assert run.call_args[0][0] == ["shutdown", "/r", "/t", "0"]


def test_shutdown_system_calls_shutdown_s():
    with mock.patch.object(win.subprocess, "run") as run:
        run.return_value = mock.Mock(returncode=0)
        result = win.shutdown_system()
    assert result["ok"] is True
    assert run.call_args[0][0] == ["shutdown", "/s", "/t", "0"]


def test_restart_system_reports_failure():
    error = win.subprocess.CalledProcessError(1, "shutdown", stderr=b"denied")
    with mock.patch.object(win.subprocess, "run", side_effect=error):
        result = win.restart_system()
    assert result["ok"] is False
    assert "denied" in result["error"]


# ── media control ────────────────────────────────────────────────────────────

def test_media_control_sends_correct_vk_code():
    with mock.patch.object(win.ctypes.windll.user32, "keybd_event") as keybd_event:
        result = win.media_control("play_pause")
    assert result["ok"] is True
    assert keybd_event.call_count == 2  # key down, key up
    assert keybd_event.call_args_list[0][0][0] == win._VK_MEDIA_PLAY_PAUSE


def test_media_control_rejects_unknown_action():
    result = win.media_control("teleport")
    assert result["ok"] is False
    assert "Unknown media action" in result["error"]


# ── brightness ────────────────────────────────────────────────────────────────

def test_get_brightness_reads_from_wmi():
    fake_monitor = mock.Mock(CurrentBrightness=42)
    fake_wmi_conn = mock.Mock()
    fake_wmi_conn.WmiMonitorBrightness.return_value = [fake_monitor]
    with mock.patch.object(win.wmi_module, "WMI", return_value=fake_wmi_conn):
        result = win.get_brightness()
    assert result == {"ok": True, "result": {"brightness": 42}}


def test_get_brightness_no_capable_display():
    fake_wmi_conn = mock.Mock()
    fake_wmi_conn.WmiMonitorBrightness.return_value = []
    with mock.patch.object(win.wmi_module, "WMI", return_value=fake_wmi_conn):
        result = win.get_brightness()
    assert result["ok"] is False


def test_set_brightness_clamps_and_calls_wmi_method():
    fake_method = mock.Mock()
    fake_wmi_conn = mock.Mock()
    fake_wmi_conn.WmiMonitorBrightnessMethods.return_value = [fake_method]
    with mock.patch.object(win.wmi_module, "WMI", return_value=fake_wmi_conn):
        result = win.set_brightness(150)  # over 100, should clamp
    assert result == {"ok": True, "result": {"brightness": 100}}
    fake_method.WmiSetBrightness.assert_called_once_with(Timeout=1, Brightness=100)


# ── idle time ────────────────────────────────────────────────────────────────

def test_get_idle_seconds_computes_from_tick_counts():
    def fake_get_last_input_info(ptr):
        struct = ctypes.cast(ptr, ctypes.POINTER(win._LASTINPUTINFO)).contents
        struct.dwTime = 5000
        return 1

    with mock.patch.object(win.ctypes.windll.user32, "GetLastInputInfo", side_effect=fake_get_last_input_info), \
         mock.patch.object(win.ctypes.windll.kernel32, "GetTickCount", return_value=8000):
        idle = win._get_idle_seconds()
    assert idle == 3.0
