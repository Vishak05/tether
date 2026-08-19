import ipaddress

from agent.core.ip_filter import _build_networks, _is_allowed

TAILNET = [ipaddress.ip_network("100.64.0.0/10")]
TAILNET_PLUS_LAN = _build_networks("100.64.0.0/10", allow_private_lan=True)


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


def test_private_lan_allowed_when_enabled():
    assert _is_allowed("192.168.1.50", TAILNET_PLUS_LAN, allow_localhost=False) is True
    assert _is_allowed("10.0.5.5", TAILNET_PLUS_LAN, allow_localhost=False) is True
    assert _is_allowed("172.16.0.1", TAILNET_PLUS_LAN, allow_localhost=False) is True


def test_private_lan_rejected_when_disabled():
    lan_disabled = _build_networks("100.64.0.0/10", allow_private_lan=False)
    assert _is_allowed("192.168.1.50", lan_disabled, allow_localhost=False) is False


def test_public_ip_still_rejected_with_private_lan_enabled():
    assert _is_allowed("8.8.8.8", TAILNET_PLUS_LAN, allow_localhost=False) is False
