import unittest

from agentglass_streamdeck.actions import Action
from agentglass_streamdeck.dispatch import plan_request
from agentglass_streamdeck.state import DeckState, set_gates, select_gate


class TestControlPlans(unittest.TestCase):
    def test_view_hits_control(self):
        self.assertEqual(
            plan_request(Action("view", "git"), DeckState()),
            ("POST", "/control", {"cmd": "view", "to": "git"}),
        )

    def test_workspace_esc_open_theme_zoom(self):
        s = DeckState()
        self.assertEqual(plan_request(Action("workspace"), s), ("POST", "/control", {"cmd": "workspace"}))
        self.assertEqual(plan_request(Action("esc"), s), ("POST", "/control", {"cmd": "esc"}))
        self.assertEqual(plan_request(Action("open", "stats"), s), ("POST", "/control", {"cmd": "open", "what": "stats"}))
        self.assertEqual(plan_request(Action("theme", -1), s), ("POST", "/control", {"cmd": "theme", "dir": -1}))
        self.assertEqual(plan_request(Action("zoom", 0), s), ("POST", "/control", {"cmd": "zoom", "dir": 0}))


class TestGatePlans(unittest.TestCase):
    def test_approve_targets_the_selected_gate(self):
        s = set_gates(DeckState(), [{"id": "a"}, {"id": "b"}])
        s = select_gate(s, 1)  # selected "b"
        method, path, body = plan_request(Action("approve"), s)
        self.assertEqual((method, path), ("POST", "/gate/decide"))
        self.assertEqual(body["id"], "b")
        self.assertEqual(body["decision"], "allow")

    def test_deny_targets_the_selected_gate_with_a_reason(self):
        s = set_gates(DeckState(), [{"id": "a"}])
        method, path, body = plan_request(Action("deny"), s)
        self.assertEqual((method, path), ("POST", "/gate/decide"))
        self.assertEqual(body["id"], "a")
        self.assertEqual(body["decision"], "deny")
        self.assertTrue(body.get("reason"))

    def test_approve_or_deny_with_empty_queue_is_no_request(self):
        self.assertIsNone(plan_request(Action("approve"), DeckState()))
        self.assertIsNone(plan_request(Action("deny"), DeckState()))


class TestLocalActionsHaveNoRequest(unittest.TestCase):
    def test_local_only_actions_return_none(self):
        for a in [Action("gate_select", 1), Action("brightness", -1), Action("noop")]:
            self.assertIsNone(plan_request(a, DeckState()))


if __name__ == "__main__":
    unittest.main()
