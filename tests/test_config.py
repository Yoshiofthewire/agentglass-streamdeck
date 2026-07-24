import os
import tempfile
import unittest

from agentglass_streamdeck.config import Config, load_config


def _write(tmp, text):
    p = os.path.join(tmp, "config.toml")
    with open(p, "w") as f:
        f.write(text)
    return p


class TestConfigDefaults(unittest.TestCase):
    def test_no_file_no_env_is_all_defaults(self):
        c = load_config(path=None, env={})
        self.assertEqual(c.server, "http://127.0.0.1:4000")
        self.assertIsNone(c.token)
        self.assertEqual(c.brightness, 60)
        self.assertEqual(c.poll_interval, 2.0)

    def test_missing_file_path_falls_back_to_defaults(self):
        c = load_config(path="/no/such/config.toml", env={})
        self.assertEqual(c, Config())


class TestConfigFile(unittest.TestCase):
    def test_reads_values_from_toml(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = _write(tmp, 'server = "http://host:9999"\nbrightness = 30\npoll_interval = 5\n')
            c = load_config(path=p, env={})
        self.assertEqual(c.server, "http://host:9999")
        self.assertEqual(c.brightness, 30)
        self.assertEqual(c.poll_interval, 5.0)


class TestConfigEnvOverride(unittest.TestCase):
    def test_env_beats_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = _write(tmp, 'server = "http://file:1"\ntoken = "file-token"\n')
            c = load_config(path=p, env={"AGENTGLASS_SERVER": "http://env:2", "AGENTGLASS_TOKEN": "env-token"})
        self.assertEqual(c.server, "http://env:2")
        self.assertEqual(c.token, "env-token")

    def test_token_from_env_when_absent_in_file(self):
        c = load_config(path=None, env={"AGENTGLASS_TOKEN": "t"})
        self.assertEqual(c.token, "t")


class TestConfigClamp(unittest.TestCase):
    def test_brightness_is_clamped_to_0_100(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = _write(tmp, "brightness = 250\n")
            self.assertEqual(load_config(path=p, env={}).brightness, 100)
            p = _write(tmp, "brightness = -5\n")
            self.assertEqual(load_config(path=p, env={}).brightness, 0)

    def test_idle_brightness_is_clamped(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = _write(tmp, "idle_brightness = 999\n")
            self.assertEqual(load_config(path=p, env={}).idle_brightness, 100)


if __name__ == "__main__":
    unittest.main()
