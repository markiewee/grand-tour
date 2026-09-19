import urllib.error

import pytest

from grandtour import http


def test_get_bytes_retries_on_429_then_succeeds(fake_response):
    calls = []

    def opener(url):
        calls.append(url)
        if len(calls) < 3:
            raise urllib.error.HTTPError(url, 429, "Too Many Requests", {}, None)
        return fake_response(b"ok")

    slept = []
    assert http.get_bytes("https://x.test/a", opener=opener, sleep=slept.append) == b"ok"
    assert len(calls) == 3
    assert slept == [8.0, 16.0]


def test_get_bytes_raises_other_errors():
    def opener(url):
        raise urllib.error.HTTPError(url, 404, "Not Found", {}, None)

    with pytest.raises(urllib.error.HTTPError):
        http.get_bytes("https://x.test/b", opener=opener, sleep=lambda s: None)


def test_get_json_encodes_params(fake_response):
    seen = []

    def opener(url):
        seen.append(url)
        return fake_response(b'{"a": 1}')

    result = http.get_json("https://x.test/api", {"q": "hà nội", "n": 2}, opener=opener, sleep=lambda s: None)
    assert result == {"a": 1}
    assert seen[0] == "https://x.test/api?q=h%C3%A0+n%E1%BB%99i&n=2"
