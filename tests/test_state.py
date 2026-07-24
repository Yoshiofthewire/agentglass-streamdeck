import unittest

from agentglass_streamdeck.state import (
    DeckState,
    set_gates,
    select_gate,
    selected_gate,
    set_connected,
)


def gate(i):
    return {"id": str(i), "tool_name": f"tool{i}", "source_app": "app"}


class TestSelectedGate(unittest.TestCase):
    def test_none_when_empty(self):
        self.assertIsNone(selected_gate(DeckState()))

    def test_points_at_the_selected_index(self):
        s = set_gates(DeckState(), [gate(0), gate(1), gate(2)])
        s = select_gate(s, 1)
        self.assertEqual(selected_gate(s)["id"], "1")


class TestSetGates(unittest.TestCase):
    def test_empty_resets_selection(self):
        s = set_gates(DeckState(selected=3), [])
        self.assertEqual(s.selected, 0)
        self.assertEqual(s.gates, [])

    def test_clamps_selection_into_range(self):
        s = set_gates(DeckState(selected=5), [gate(0), gate(1)])
        self.assertEqual(s.selected, 1)

    def test_keeps_pointing_at_the_same_request_when_an_earlier_one_resolves(self):
        # Selected the middle gate; the first is approved elsewhere and drops out.
        s = set_gates(DeckState(), [gate(0), gate(1), gate(2)])
        s = select_gate(s, 1)                       # selected id "1"
        s = set_gates(s, [gate(1), gate(2)])        # gate 0 gone
        self.assertEqual(selected_gate(s)["id"], "1")
        self.assertEqual(s.selected, 0)

    def test_falls_back_to_clamp_when_selected_request_is_gone(self):
        s = set_gates(DeckState(), [gate(0), gate(1)])
        s = select_gate(s, 1)                       # selected id "1"
        s = set_gates(s, [gate(0)])                 # gate 1 gone
        self.assertEqual(s.selected, 0)
        self.assertEqual(selected_gate(s)["id"], "0")


class TestSelectGate(unittest.TestCase):
    def test_wraps_forward_past_the_end(self):
        s = set_gates(DeckState(), [gate(0), gate(1)])
        s = select_gate(s, 1)
        s = select_gate(s, 1)   # from index 1, wrap to 0
        self.assertEqual(s.selected, 0)

    def test_wraps_backward_below_zero(self):
        s = set_gates(DeckState(), [gate(0), gate(1), gate(2)])
        s = select_gate(s, -1)  # from 0, wrap to 2
        self.assertEqual(s.selected, 2)

    def test_empty_queue_never_errors(self):
        s = select_gate(DeckState(), 1)
        self.assertEqual(s.selected, 0)


class TestSetters(unittest.TestCase):
    def test_set_connected_does_not_touch_gates(self):
        s = set_gates(DeckState(), [gate(0)])
        s2 = set_connected(s, True)
        self.assertTrue(s2.connected)
        self.assertEqual(s2.gates, s.gates)


if __name__ == "__main__":
    unittest.main()
