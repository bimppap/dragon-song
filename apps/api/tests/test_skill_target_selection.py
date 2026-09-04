import unittest
from fastapi import HTTPException
from app.crud import _explicit_skill_targets, _multi_target_skill_count


class SkillTargetSelectionTest(unittest.TestCase):
    def test_only_selected_targets_in_selected_order(self):
        candidates = {"ally:1": {"id": 1}, "ally:2": {"id": 2}, "ally:3": {"id": 3}}
        self.assertEqual(_explicit_skill_targets(["ally:3", "ally:1"], candidates, 2), [{"id": 3}, {"id": 1}])

    def test_rejects_wrong_count_duplicates_and_invalid_targets(self):
        candidates = {"enemy:1": 1, "summon:1": 2, "enemy:2": 3}
        for keys in ([], ["enemy:1"], ["enemy:1", "summon:1", "enemy:2"], ["enemy:1", "enemy:1"], ["enemy:1", "ally:1"]):
            with self.subTest(keys=keys), self.assertRaises(HTTPException):
                _explicit_skill_targets(keys, candidates, 2)

    def test_fewer_available_targets_and_skill_count(self):
        self.assertEqual(_explicit_skill_targets(["ally:1"], {"ally:1": 1}, 4), [1])
        self.assertEqual(_multi_target_skill_count({"skill_target": 1}, 3), 4)


if __name__ == "__main__":
    unittest.main()
