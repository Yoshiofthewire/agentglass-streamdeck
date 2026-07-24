import unittest

from agentglass_streamdeck import render


class TestKeyImage(unittest.TestCase):
    def test_returns_an_image_of_the_requested_size(self):
        img = render.key_image((120, 120), "git")
        self.assertEqual(img.size, (120, 120))
        self.assertEqual(img.mode, "RGB")

    def test_subtitle_badge_and_emphasis_render_without_error(self):
        img = render.key_image((96, 96), "approve", subtitle="2", accent=(244, 63, 94), emphasis=True)
        self.assertEqual(img.size, (96, 96))


class TestTouchscreenImage(unittest.TestCase):
    def test_four_zone_strip_matches_requested_size(self):
        cells = [
            {"title": "agents", "value": "3"},
            {"title": "cost", "value": "$0.42"},
            {"title": "health", "value": "88"},
            {"title": "waiting", "value": "1"},
        ]
        img = render.touchscreen_image((800, 100), cells)
        self.assertEqual(img.size, (800, 100))
        self.assertEqual(img.mode, "RGB")

    def test_no_cells_still_paints_a_strip(self):
        img = render.touchscreen_image((800, 100), [])
        self.assertEqual(img.size, (800, 100))


if __name__ == "__main__":
    unittest.main()
