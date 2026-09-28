import unittest

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import crud
from app.db import Base
from app.models import BattleSession, Character, CharacterSkillUnlock, Enemy, Member, SkillNode
from app.schemas import (
    BattleAllyTurnRequest, BattleJoinRequest, BattleStartRequest, BattleTelegraphRequest,
    CharacterActionInput, EnvironmentCreate,
)


class AnvilSkillTest(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)

        self.locked_environment = crud.create_environment(
            self.db,
            EnvironmentCreate(chapter="1장", name="해제 불가 안개", dispellable=False),
        )
        self.old_environment = crud.create_environment(
            self.db,
            EnvironmentCreate(chapter="1장", name="늪의 저주", dispellable=True),
        )
        self.new_environment = crud.create_environment(
            self.db,
            EnvironmentCreate(chapter="1장", name="독기", dispellable=True),
        )
        self.character = Character(
            name="실험 요정 B",
            faction="수비",
            hp=78,
            hp_max=100,
            mp=10,
            mp_max=10,
            skill_eff_fixed=0.02,
            skill_eff_true=3,
            heal_eff=0.5,
            presence=1,
        )
        self.db.add(self.character)
        self.db.flush()
        self.skill = SkillNode(
            book="불굴의 서",
            branch=0,
            col=None,
            tier=1,
            default_name="모루 I",
            trigger_type="즉발형",
            category="복합",
            stackable=False,
            var_name="ab_anvil",
            cost=3,
            power=0.15,
            target="SELF",
            activation_order=3,
            cleanse_count=1,
            is_public=True,
        )
        self.db.add(self.skill)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=self.character.id, node_id=self.skill.id))

        participant = crud._snapshot_combatant(self.character)
        participant.update(
            attn=5,
            env_stacks={
                str(self.locked_environment.id): 1,
                str(self.old_environment.id): 2,
                str(self.new_environment.id): 1,
            },
            env_stack_order=[
                str(self.locked_environment.id),
                str(self.old_environment.id),
                str(self.new_environment.id),
                str(self.old_environment.id),
            ],
        )
        self.battle = BattleSession(
            mode="practice",
            chapter="1장",
            status="in_progress",
            phase="ally",
            round=1,
            participants=[participant],
            enemies=[{
                "enemy_id": 1,
                "name": "오버그로스",
                "hp": 2500,
                "max_hp": 2500,
                "attack": 0,
                "skills": [],
                "status_effects": [],
                "joined_round": 0,
            }],
            summons=[],
            log=[],
        )
        self.db.add(self.battle)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_anvil_uses_skill_power_heals_attention_and_removes_oldest_dispellable_stack(self):
        result = crud.resolve_battle_ally_turn(
            self.db,
            self.battle.id,
            BattleAllyTurnRequest(character_actions=[CharacterActionInput(
                character_id=self.character.id,
                kind="skill",
                skill_node_id=self.skill.id,
            )]),
        )

        participant = result.participants[0]
        # 모루도 기술 대상 설정을 따르게 되면서 로그에 대상 이름이 함께 붙는다.
        event = "🪨 실험 요정 B의 모루 I → 실험 요정 B 22 치유 · 늪의 저주 스택 -1 · MP -3 [7/10]"
        self.assertIn(event, result.log[-1]["events"])
        self.assertEqual(participant["hp"], 100)
        # 주목도는 실제 회복량 × 기술 등급(1단계)만큼 오른다.
        self.assertEqual(participant["attn"], 27)
        self.assertEqual(participant["env_stacks"], {
            str(self.locked_environment.id): 1,
            str(self.old_environment.id): 1,
            str(self.new_environment.id): 1,
        })
        self.assertEqual(participant["env_stack_order"], [
            str(self.locked_environment.id),
            str(self.new_environment.id),
            str(self.old_environment.id),
        ])
        self.assertEqual(
            result.log[-1]["calculations"][event],
            "min(floor(최대 체력 100 × (기술 위력 0.15 × (1 + 기술 효율 비례 0.02)) × "
            "(1 + 치유 효율 0.5)), 잃은 체력 22)",
        )


class AnvilStartAttentionTest(unittest.TestCase):
    """[상시 적용] 모루를 가진 캐릭터는 전투에 들어설 때 단계 × 200 주목도를 얻는다."""

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = Session(self.engine)
        self.member = Member(login_id="admin", password_hash="x", role="ADMIN")
        self.holder = Character(name="모루지기", faction="수비", hp=100, hp_max=100, mp=10, mp_max=10)
        self.other = Character(name="일반인", faction="공격", hp=100, hp_max=100, mp=10, mp_max=10)
        self.enemy = Enemy(name="용", chapter="1장", base_hp=500, attack=20)
        self.db.add_all([self.member, self.holder, self.other, self.enemy])
        self.db.flush()
        self.node = SkillNode(
            book="불굴의 서", branch=0, col=0, tier=3, default_name="모루", trigger_type="즉발형",
            category="복합", stackable=False, var_name="ab_anvil", cost=3, power=0.15,
            target="SELF", target_side="ALLY", activation_order=3, cleanse_count=3, is_public=True,
        )
        self.db.add(self.node)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=self.holder.id, node_id=self.node.id))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def start(self):
        return crud.start_battle(self.db, self.member, BattleStartRequest(
            mode="practice", character_ids=[self.holder.id, self.other.id], enemy_ids=[self.enemy.id],
        ))

    def test_start_attention_scales_with_the_node_tier(self):
        session = self.start()
        by_name = {p["name"]: p for p in session.participants}
        self.assertEqual(by_name["모루지기"]["attn"], 600)
        self.assertEqual(by_name["일반인"]["attn"], 0)
        self.assertIn("🪨 모루지기의 모루 · 전투 시작 주목도 +600", session.log[0]["events"])
        self.assertEqual(session.log[0]["kind"], "start")

    def test_start_attention_is_granted_once_per_character(self):
        session = self.start()
        battle = self.db.get(BattleSession, session.id)
        # 턴을 진행해도 시작 주목도가 다시 붙지 않는다.
        crud.resolve_battle_telegraph(self.db, battle.id, BattleTelegraphRequest(
            enemy_actions=[{"enemy_id": self.enemy.id, "kind": "none"}],
        ))
        refreshed = crud.get_battle_session(self.db, battle.id, self.member)
        holder = next(p for p in refreshed.participants if p["name"] == "모루지기")
        self.assertEqual(holder["attn"], 600)

    def test_joining_character_gets_it_when_they_enter(self):
        session = self.start()
        latecomer = Character(name="지각생", faction="수비", hp=100, hp_max=100, mp=10, mp_max=10)
        self.db.add(latecomer)
        self.db.flush()
        self.db.add(CharacterSkillUnlock(character_id=latecomer.id, node_id=self.node.id))
        self.db.commit()
        joined = crud.join_battle(self.db, session.id, BattleJoinRequest(character_id=latecomer.id))
        newcomer = next(p for p in joined.participants if p["name"] == "지각생")
        self.assertEqual(newcomer["attn"], 600)
        self.assertIn("🪨 지각생의 모루 · 전투 시작 주목도 +600", joined.log[-1]["events"])


if __name__ == "__main__":
    unittest.main()
