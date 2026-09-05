import unittest

from app import crud


class BattleLogMetricsTest(unittest.TestCase):
    def test_metrics_classify_damage_and_healing_by_source(self):
        entries = [
            {
                "round": 1,
                "phase": "telegraph",
                "events": [
                    "☠️ 요정 A의 맹독 I → 오버그로스에게 1,200 지속 피해 · [1300/2500]",
                    "🌫️ 환경 · 늪의 저주",
                    "　→ 요정 A · 피해 34 [66/100]",
                    "이번 차례 공격 대상 : 요정 A / 예상 피해 : 999",
                    "💥 하수인 폭탄 폭발 → 요정 B 7 피해 [93/100]",
                ],
            },
            {
                "round": 1,
                "phase": "ally",
                "events": [
                    "✨ 요정 A의 강타 I → 오버그로스 36 피해 · [2464/2500]",
                    "⚔️ 요정 B 공격: 11 피해 · 오버그로스 [2453/2500]",
                    "⚔️ 요정 C의 사용자 기술: 9 피해 · 오버그로스 [2444/2500]",
                    "🕊️ 요정 D의 구호 I → 요정 A 20 치유 · [100/100]",
                    "💚 요정 D → 요정 B 5 치유 (마나 -1) · 요정 B [80→85/100]",
                ],
            },
            {
                "round": 1,
                "phase": "enemy",
                "events": [
                    "🔥 오버그로스의 할퀴기 → 요정 A 8 피해 · 요정 A [92/100]",
                    "👹 하수인 덩굴 공격 → 요정 B 3 피해 · 요정 B [82/100]",
                    "↩️ 요정 A의 반격 I → 오버그로스 6 반격 피해 · [2438/2500]",
                ],
            },
        ]

        enriched = crud._battle_log_with_metrics(entries)

        self.assertEqual(enriched[0]["metrics"], {
            "ally_skill_damage": 1200,
            "ally_basic_damage": 0,
            "ally_healing": 0,
            "enemy_damage": 41,
        })
        self.assertEqual(enriched[1]["metrics"], {
            "ally_skill_damage": 45,
            "ally_basic_damage": 11,
            "ally_healing": 25,
            "enemy_damage": 0,
        })
        self.assertEqual(enriched[2]["metrics"], {
            "ally_skill_damage": 6,
            "ally_basic_damage": 0,
            "ally_healing": 0,
            "enemy_damage": 11,
        })

    def test_enrichment_does_not_mutate_stored_log(self):
        log = [{"round": 2, "phase": "ally", "events": ["⚔️ 요정 A 공격: 10 피해 · 적 [90/100]"]}]

        enriched = crud._battle_log_with_metrics(log)

        self.assertNotIn("metrics", log[0])
        self.assertEqual(enriched[0]["events"], log[0]["events"])
        self.assertEqual(enriched[0]["metrics"]["ally_basic_damage"], 10)


if __name__ == "__main__":
    unittest.main()
