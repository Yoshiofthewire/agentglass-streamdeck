import unittest

from agentglass_streamdeck.layout import KEY_VIEWS, N_KEYS
from agentglass_streamdeck.state import DeckState, set_gates
from agentglass_streamdeck import view


def gate(i, tool):
    return {"id": str(i), "tool_name": tool, "source_app": "my-app"}


class TestKeySpecs(unittest.TestCase):
    def test_one_spec_per_physical_key(self):
        specs = view.key_specs(DeckState())
        self.assertEqual(len(specs), N_KEYS)
        for s in specs:
            self.assertIn("title", s)
            self.assertIn("emphasis", s)

    def test_first_six_are_the_views(self):
        specs = view.key_specs(DeckState())
        self.assertEqual([s["title"] for s in specs[:6]], KEY_VIEWS)

    def test_home_and_approve_keys(self):
        specs = view.key_specs(DeckState())
        self.assertEqual(specs[6]["title"], "home")
        self.assertEqual(specs[7]["title"], "approve")


class TestApproveKey(unittest.TestCase):
    def test_quiet_when_no_pending(self):
        spec = view.key_specs(DeckState())[7]
        self.assertFalse(spec["emphasis"])
        self.assertEqual(spec["subtitle"], "")

    def test_lit_with_a_count_when_pending(self):
        s = set_gates(DeckState(), [gate(0, "Bash"), gate(1, "Write")])
        spec = view.key_specs(s)[7]
        self.assertTrue(spec["emphasis"])
        self.assertEqual(spec["subtitle"], "2")


class TestTouchCells(unittest.TestCase):
    def test_four_zones_over_the_dials(self):
        cells = view.touch_cells(DeckState())
        self.assertEqual(len(cells), 4)
        self.assertEqual([c["title"] for c in cells], ["gate", "theme", "zoom", "deck"])

    def test_gate_zone_names_the_selected_tool_when_pending(self):
        s = set_gates(DeckState(), [gate(0, "Bash")])
        self.assertEqual(view.touch_cells(s)[0]["value"], "Bash")

    def test_gate_zone_says_none_when_empty(self):
        self.assertEqual(view.touch_cells(DeckState())[0]["value"], "none")


if __name__ == "__main__":
    unittest.main()
