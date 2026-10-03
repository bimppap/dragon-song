import unittest

from app import crud
from app.schemas import ITEM_EFFECT_BUFFABLE_STATS


class BattleStatLabelsTest(unittest.TestCase):
    """전투 로그가 능력치 키(max_mp 등)를 그대로 보여주지 않도록 라벨이 빠짐없이 있어야 한다."""

    def test_battle_snapshot_keys_have_labels(self):
        missing = set(crud.BATTLE_ITEM_EFFECT_KEYS.values()) - set(crud.BATTLE_ITEM_EFFECT_LABELS)
        self.assertEqual(missing, set())

    def test_skill_stat_stacks_have_labels(self):
        # 충전 6단계(max_mp)·생명 계열(max_hp) 등 기술이 거는 능력치 스택.
        self.assertLessEqual({"max_hp", "max_mp", "atk", "atk_p", "presence", "hp_regen_true"}, set(crud.BATTLE_ITEM_EFFECT_LABELS))

    def test_item_buff_stats_have_labels(self):
        self.assertEqual(ITEM_EFFECT_BUFFABLE_STATS - set(crud.BATTLE_ITEM_EFFECT_LABELS), set())


if __name__ == "__main__":
    unittest.main()
