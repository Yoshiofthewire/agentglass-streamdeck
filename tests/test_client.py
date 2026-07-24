import unittest

from agentglass_streamdeck.client import AgentglassClient
from agentglass_streamdeck.config import Config


class TestHeaders(unittest.TestCase):
    def test_no_token_is_json_only(self):
        c = AgentglassClient(Config())
        self.assertEqual(c._headers(), {"content-type": "application/json"})

    def test_token_becomes_a_bearer_header(self):
        c = AgentglassClient(Config(token="secret"))
        self.assertEqual(c._headers()["authorization"], "Bearer secret")


class TestWsUrl(unittest.TestCase):
    def test_http_becomes_ws_with_stream_path(self):
        c = AgentglassClient(Config(server="http://127.0.0.1:4000"))
        self.assertEqual(c._ws_url(), "ws://127.0.0.1:4000/stream")

    def test_https_becomes_wss(self):
        c = AgentglassClient(Config(server="https://box:4000"))
        self.assertTrue(c._ws_url().startswith("wss://box:4000/stream"))

    def test_token_rides_the_query_string(self):
        # A browser can't set a header on a WS upgrade; the daemon matches that.
        c = AgentglassClient(Config(server="http://h:1", token="t"))
        self.assertEqual(c._ws_url(), "ws://h:1/stream?token=t")

    def test_trailing_slash_on_server_is_not_doubled(self):
        c = AgentglassClient(Config(server="http://h:1/"))
        self.assertEqual(c._ws_url(), "ws://h:1/stream")


if __name__ == "__main__":
    unittest.main()
