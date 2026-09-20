"""GET helpers with a polite User-Agent and a retry on HTTP 429."""
import json
import time
import urllib.error
import urllib.parse
import urllib.request

USER_AGENT = "GrandTour/0.1 (https://github.com/markiewee/great-adventure)"


def _open(url, timeout=40):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    return urllib.request.urlopen(request, timeout=timeout)


def get_bytes(url, retries=5, backoff=8.0, sleep=time.sleep, opener=None):
    opener = opener or _open
    for attempt in range(retries + 1):
        try:
            with opener(url) as response:
                return response.read()
        except urllib.error.HTTPError as err:
            if err.code == 429 and attempt < retries:
                sleep(backoff * (attempt + 1))
                continue
            raise


def get_json(url, params=None, **kwargs):
    if params:
        url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    return json.loads(get_bytes(url, **kwargs))
