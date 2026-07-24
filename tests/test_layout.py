import unittest

from agentglass_streamdeck.actions import Action
from agentglass_streamdeck.layout import KEY_VIEWS, key_action, dial_action, N_KEYS, N_DIALS


class TestKeyLayout(unittest.TestCase):
    def test_first_six_keys_open_the_six_views_in_rail_order(self):
        self.assertEqual(KEY_VIEWS, ["git", "diff", "pr", "docker", "term", "chat"])
        for i, view in enumerate(KEY_VIEWS):
            self.assertEqual(key_action(i), Action("view", view))

    def test_key_six_is_home_escape(self):
        self.assertEqual(key_action(6), Action("esc"))

    def test_key_seven_approves(self):
        self.assertEqual(key_action(7), Action("approve"))

    def test_out_of_range_key_is_noop(self):
        self.assertEqual(key_action(N_KEYS), Action("noop"))
        self.assertEqual(key_action(-1), Action("noop"))


class TestDialLayout(unittest.TestCase):
    def test_dial0_turns_select_a_gate_and_push_denies(self):
        self.assertEqual(dial_action(0, "turn", 3), Action("gate_select", 1))
        self.assertEqual(dial_action(0, "turn", -2), Action("gate_select", -1))
        self.assertEqual(dial_action(0, "push", 0), Action("deny"))

    def test_dial1_turns_cycle_theme_and_push_is_noop(self):
        self.assertEqual(dial_action(1, "turn", 1), Action("theme", 1))
        self.assertEqual(dial_action(1, "turn", -5), Action("theme", -1))
        self.assertEqual(dial_action(1, "push", 0), Action("noop"))

    def test_dial2_turns_zoom_and_push_resets_zoom(self):
        self.assertEqual(dial_action(2, "turn", 1), Action("zoom", 1))
        self.assertEqual(dial_action(2, "turn", -1), Action("zoom", -1))
        self.assertEqual(dial_action(2, "push", 0), Action("zoom", 0))

    def test_dial3_turns_adjust_brightness_and_push_toggles_workspace(self):
        # Brightness is local to the deck (no server round-trip).
        self.assertEqual(dial_action(3, "turn", 2), Action("brightness", 1))
        self.assertEqual(dial_action(3, "turn", -3), Action("brightness", -1))
        self.assertEqual(dial_action(3, "push", 0), Action("workspace"))

    def test_zero_turn_is_noop(self):
        self.assertEqual(dial_action(0, "turn", 0), Action("noop"))

    def test_out_of_range_dial_is_noop(self):
        self.assertEqual(dial_action(N_DIALS, "turn", 1), Action("noop"))
        self.assertEqual(dial_action(1, "sideways", 1), Action("noop"))


class TestActionValue(unittest.TestCase):
    def test_action_is_frozen_and_value_equal(self):
        self.assertEqual(Action("view", "git"), Action("view", "git"))
        with self.assertRaises(Exception):
            Action("view", "git").kind = "zoom"  # type: ignore[misc]


if __name__ == "__main__":
    unittest.main()
