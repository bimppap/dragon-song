import unittest

from app import crud


class NegativeDamageReductionTest(unittest.TestCase):
    """피해 감소율이 음수면 받는 피해가 그만큼 늘고, 하한은 없다."""

    def test_negative_reduction_increases_damage_without_floor(self):
        for dmg_r, expected in ((-0.2, 120), (-1.5, 250)):
            with self.subTest(dmg_r=dmg_r):
                reduction = crud._damage_reduction({"dmg_r": dmg_r, "defending": False, "faction": "공격"})
                self.assertEqual(crud._floor_amount(100 * (1 - reduction)), expected)

    def test_debuff_can_push_damage_reduction_below_zero(self):
        for current, expected in ((0.1, -0.2), (-0.1, -0.4)):
            with self.subTest(current=current):
                target = {"dmg_r": current, "status_effects": []}
                crud._add_combat_stat_stack(target, source="enemy", name="약화", stat="dmg_r", amount=0.3,
                                            percent=False, stackable=True, direction="decrease")
                self.assertAlmostEqual(target["dmg_r"], expected)

    def test_debuff_never_raises_other_negative_stats(self):
        target = {"atk": -3, "status_effects": []}
        crud._add_combat_stat_stack(target, source="enemy", name="약화", stat="atk", amount=5,
                                    percent=False, stackable=True, direction="decrease")
        self.assertEqual(target["atk"], -3)
        target = {"atk": 2, "status_effects": []}
        crud._add_combat_stat_stack(target, source="enemy", name="약화", stat="atk", amount=5,
                                    percent=False, stackable=True, direction="decrease")
        self.assertEqual(target["atk"], 0)


if __name__ == "__main__":
    unittest.main()
