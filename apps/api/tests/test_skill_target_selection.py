import unittest
from fastapi import HTTPException
from app.crud import _damage_from_skill_power, _explicit_skill_targets, _multi_target_skill_count


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

    def test_skill_damage_applies_proportional_and_fixed_efficiency_in_order(self):
        actor = {
            "atk": 10,
            "atk_p": 0.1,
            "dmg_p": 0.0,
            "skill_eff_true": 5,
            "status_effects": [],
        }

        damage, formula = _damage_from_skill_power(actor, skill_power=3, skill_eff_fixed=0.1)

        self.assertEqual(damage, 41)
        self.assertEqual(
            f"min({formula}, 남은 체력 2500)",
            "min(floor(공격력 10 × (1 + 공격력 증폭률 0.1) × "
            "(기술 위력 3 × (1 + 기술 효율 비례 0.1)) × "
            "(1 + 피해 증폭 0) + 기술 효율 고정 5), 남은 체력 2500)",
        )


if __name__ == "__main__":
    unittest.main()
