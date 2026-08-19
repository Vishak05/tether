import ipaddress

from agent.core.ip_filter import _is_allowed

TAILNET = ipaddress.ip_network("100.64.0.0/10")


def test_ip_inside_cidr_is_allowed():
    assert _is_allowed("100.64.1.5", TAILNET, allow_localhost=False) is True


def test_ip_outside_cidr_is_rejected():
    assert _is_allowed("192.168.1.50", TAILNET, allow_localhost=False) is False


def test_localhost_allowed_when_flag_set():
    assert _is_allowed("127.0.0.1", TAILNET, allow_localhost=True) is True
    assert _is_allowed("::1", TAILNET, allow_localhost=True) is True


def test_localhost_rejected_when_flag_unset():
    assert _is_allowed("127.0.0.1", TAILNET, allow_localhost=False) is False


def test_garbage_ip_is_rejected():
    assert _is_allowed("not-an-ip", TAILNET, allow_localhost=False) is False
