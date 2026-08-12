import { Sword, Shield, Wand2, HeartPulse, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const ROLES = [
  {
    id: "warrior",
    name: "전사",
    icon: Sword,
    description: "높은 방어력과 체력으로 파티의 최전선을 담당한다. 적의 어그로를 집중시키는 탱커 역할.",
    traits: ["높은 HP", "강한 방어력", "어그로 관리"],
    strengths: "생존력, 파티 보호",
    weaknesses: "낮은 기동성, 마법 저항 약함",
    active: true,
  },
  {
    id: "mage",
    name: "마법사",
    icon: Wand2,
    description: "강력한 마법으로 적에게 막대한 피해를 입힌다. 광역기 전문으로 다수의 적을 상대하는 딜러.",
    traits: ["높은 마법 공격력", "광역 스킬", "원거리 공격"],
    strengths: "폭발적 딜량, 광역 제어",
    weaknesses: "낮은 HP, 근접전 취약",
    active: false,
  },
  {
    id: "healer",
    name: "힐러",
    icon: HeartPulse,
    description: "파티원의 HP를 회복하고 버프를 제공한다. 파티의 지속 전투력을 유지하는 서포터.",
    traits: ["회복 스킬", "버프/디버프", "보조 마법"],
    strengths: "파티 지속력, 상태이상 해제",
    weaknesses: "낮은 공격력, 단독 전투 어려움",
    active: false,
  },
  {
    id: "rogue",
    name: "도적",
    icon: Eye,
    description: "높은 민첩성으로 적의 약점을 노려 치명타를 날린다. 단일 대상 특화 딜러.",
    traits: ["높은 민첩", "치명타 특화", "은신 스킬"],
    strengths: "단일 딜량, 회피율",
    weaknesses: "낮은 방어력, 광역 딜 없음",
    active: false,
  },
  {
    id: "paladin",
    name: "팔라딘",
    icon: Shield,
    description: "신성한 힘으로 방어와 회복을 겸비한 올라운더. 소규모 파티에 적합.",
    traits: ["신성 마법", "자가 회복", "방어 버프"],
    strengths: "균형 잡힌 스탯, 자급자족",
    weaknesses: "극딜 불가, 특화 역할 없음",
    active: false,
  },
];

export default function RoleTab() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-ivory">전투 역할</h2>
        <p className="text-sm text-muted">캐릭터의 전투 포지션을 확인하세요.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.map(({ id, name, icon: Icon, description, traits, strengths, weaknesses, active }) => (
          <div
            key={id}
            className={`border rounded-xl p-5 bg-surface space-y-4 transition ${
              active
                ? "border-gold ring-2 ring-gold shadow-sm"
                : "border-line hover:border-line"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-gold/15" : "bg-primary-light/20"}`}>
                <Icon size={20} className={active ? "text-gold" : "text-muted"} />
              </div>
              <div className="flex-1">
                <p className="font-bold text-ivory">{name}</p>
              </div>
              {active && <Badge variant="default">현재 역할</Badge>}
            </div>

            <p className="text-xs text-muted leading-relaxed">{description}</p>

            <div className="flex flex-wrap gap-1.5">
              {traits.map((t) => (
                <span key={t} className="text-[11px] bg-primary-light/20 text-ivory/85 px-2 py-0.5 rounded-full font-medium">
                  {t}
                </span>
              ))}
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex gap-2">
                <span className="text-emerald-600 font-semibold shrink-0">강점</span>
                <span className="text-muted">{strengths}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-red-500 font-semibold shrink-0">약점</span>
                <span className="text-muted">{weaknesses}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
