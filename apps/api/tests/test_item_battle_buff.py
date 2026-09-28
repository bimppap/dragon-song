"""아이템 효과 "일회성 강화": 전투 중에 쓰면 다음 라운드까지만 능력치가 오른다."""
import unittest

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, Purchase
from app.schemas import BattleAllyTurnRequest, CharacterActionInput, ItemCreate, BattleTelegraphRequest


def buff_item(**overrides):
    values = dict(
        name="전투 각성제", price_gold=1, item_type="consumable", battle_only=True,
        effects=[
            {"stat": "battle_buff_round", "delta": 0},
            {"stat": "atk", "delta": 30},
            {"stat": "dmg_r", "delta": 0.2},
        ],
    )
    values.update(overrides)
    return ItemCreate(**values)


class ItemBattleBuffValidationTest(unittest.TestCase):
    def test_requires_battle_only_and_at_least_one_stat(self):
        with self.assertRaises(ValidationError):
            buff_item(battle_only=False)
        with self.assertRaises(ValidationError):
            buff_item(effects=[{"stat": "battle_buff_round", "delta": 0}])
        # 되돌릴 수 없는 자원(체력·보호막 등)은 강화 항목으로 쓸 수 없다.
        with self.assertRaises(ValidationError):
            buff_item(effects=[{"stat": "battle_buff_round", "delta": 0}, {"stat": "sh", "delta": 10}])
        # 다른 특수 효과와 함께 담을 수 없다.
        with self.assertRaises(ValidationError):
            buff_item(effects=[
                {"stat": "battle_buff_round", "delta": 0},
                {"stat": "cleanse_debuffs", "delta": 0},
                {"stat": "atk", "delta": 5},
            ])
        # 장착형에는 설정할 수 없다.
        with self.assertRaises(ValidationError):
            buff_item(item_type="accessory", special_merchant=True, battle_only=False)
        self.assertTrue(buff_item().battle_only)


class ItemBattleBuffCombatTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.hero = Character(name="용사", faction="공격", hp=100, hp_max=100, mp=10, mp_max=10, atk=10)
        self.db.add(self.hero)
        self.db.flush()
        self.item = crud.create_item(self.db, buff_item())
        self.db.add(Purchase(character_id=self.hero.id, item_id=self.item.id, quantity=5))
        self.battle = BattleSession(
            mode="practice", chapter="1장", status="in_progress", phase="ally", round=1,
            participants=[crud._snapshot_combatant(self.hero)],
            enemies=[{"enemy_id": 1, "name": "용", "hp": 9999, "max_hp": 9999, "attack": 0,
                      "skills": [], "status_effects": [], "joined_round": 0}],
            summons=[], log=[],
        )
        self.db.add(self.battle)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def actor(self, result):
        return result.participants[0]

    def act(self, kind="none", **kwargs):
        self.battle.phase = "ally"
        self.db.commit()
        return crud.resolve_battle_ally_turn(self.db, self.battle.id, BattleAllyTurnRequest(
            character_actions=[CharacterActionInput(character_id=self.hero.id, kind=kind, **kwargs)],
        ))

    def enemy_turn(self):
        self.battle.phase = "enemy"
        self.db.commit()
        return crud.resolve_battle_enemy_turn(self.db, self.battle.id)

    def test_buff_lasts_through_the_next_round_and_is_reverted(self):
        result = self.act("item", item_id=self.item.id)
        actor = self.actor(result)
        self.assertEqual(actor["atk"], 40)
        self.assertAlmostEqual(actor["dmg_r"], 0.2)
        self.assertIn("🎒 용사 전투 각성제 사용 · 다음 라운드까지 일회성 강화 (공격력 +30, 피해 감소 +20%)",
                      result.log[-1]["events"])

        # 아이템을 쓴 라운드의 에너미 턴에도 유지된다.
        actor = self.actor(self.enemy_turn())
        self.assertEqual(actor["atk"], 40)

        # 다음 라운드에는 강화된 채로 행동한다.
        self.battle.round = 2
        self.db.commit()
        actor = self.actor(self.act("attack", target_enemy_id=1))
        self.assertEqual(actor["atk"], 40)

        # 그 라운드의 에너미 턴이 끝나면 원래 값으로 돌아간다.
        actor = self.actor(self.enemy_turn())
        self.assertEqual(actor["atk"], 10)
        self.assertAlmostEqual(actor["dmg_r"], 0.0)
        self.assertEqual(crud._status_effects_of_type(actor, "stat_modifier"), [])

    def test_buff_stacks_when_used_again(self):
        self.act("item", item_id=self.item.id)
        self.battle.round = 2
        self.db.commit()
        actor = self.actor(self.act("item", item_id=self.item.id))
        self.assertEqual(actor["atk"], 70)
        # 첫 아이템은 2라운드 에너미 턴에, 두 번째는 3라운드 에너미 턴에 풀린다.
        actor = self.actor(self.enemy_turn())
        self.assertEqual(actor["atk"], 40)
        self.battle.round = 3
        self.db.commit()
        self.act()
        actor = self.actor(self.enemy_turn())
        self.assertEqual(actor["atk"], 10)


if __name__ == "__main__":
    unittest.main()
