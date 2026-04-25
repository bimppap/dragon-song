import { Zap, FlameKindling, Snowflake, Wind, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const SKILLS = [
  {
    id: 1,
    name: "파이어볼",
    icon: FlameKindling,
    type: "공격",
    element: "화염",
    damage: "150%",
    cooldown: "3턴",
    mp: 25,
    description: "강렬한 화염구를 적에게 발사해 광역 피해를 입힌다.",
    level: 5,
    maxLevel: 10,
  },
  {
    id: 2,
    name: "아이스 스피어",
    icon: Snowflake,
    type: "공격",
    element: "빙결",
    damage: "120%",
    cooldown: "2턴",
    mp: 20,
    description: "얼음 창을 적에게 꽂아 이동 속도를 감소시킨다.",
    level: 3,
    maxLevel: 10,
  },
  {
    id: 3,
    name: "썬더 스트라이크",
    icon: Zap,
    type: "공격",
    element: "번개",
    damage: "180%",
    cooldown: "5턴",
    mp: 40,
    description: "하늘에서 번개를 내려 적 전체를 감전시킨다.",
    level: 7,
    maxLevel: 10,
  },
  {
    id: 4,
    name: "윈드 슬래시",
    icon: Wind,
    type: "공격",
    element: "바람",
    damage: "90%",
    cooldown: "1턴",
    mp: 10,
    description: "빠른 바람 베기로 2회 연속 공격한다.",
    level: 10,
    maxLevel: 10,
  },
  {
    id: 5,
    name: "얼티밋 버스트",
    icon: Star,
    type: "필살기",
    element: "무속성",
    damage: "400%",
    cooldown: "10턴",
    mp: 100,
    description: "모든 힘을 한 점에 모아 적을 궤멸시키는 최강의 기술.",
    level: 1,
    maxLevel: 5,
  },
];

const ELEMENT_COLORS: Record<string, string> = {
  화염: "text-red-500",
  빙결: "text-blue-400",
  번개: "text-yellow-500",
  바람: "text-emerald-500",
  무속성: "text-slate-500",
};

export default function SkillTab() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-slate-800">보유 스킬</h2>
        <p className="text-sm text-slate-500">습득한 스킬 목록입니다.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SKILLS.map(({ id, name, icon: Icon, type, element, damage, cooldown, mp, description, level, maxLevel }) => (
          <div key={id} className="border border-slate-200 rounded-xl p-5 bg-white space-y-3 hover:border-indigo-300 hover:shadow-sm transition">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <Icon size={20} className={ELEMENT_COLORS[element]} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 leading-tight">{name}</p>
                <p className="text-xs text-slate-400 mt-0.5">{element} · {type}</p>
              </div>
              <Badge variant={type === "필살기" ? "destructive" : "secondary"}>{type}</Badge>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">{description}</p>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-slate-50 rounded-lg py-1.5">
                <p className="text-slate-400">피해량</p>
                <p className="font-bold text-slate-700">{damage}</p>
              </div>
              <div className="bg-slate-50 rounded-lg py-1.5">
                <p className="text-slate-400">쿨다운</p>
                <p className="font-bold text-slate-700">{cooldown}</p>
              </div>
              <div className="bg-slate-50 rounded-lg py-1.5">
                <p className="text-slate-400">MP</p>
                <p className="font-bold text-blue-500">{mp}</p>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>레벨 {level} / {maxLevel}</span>
                <span>{Math.round((level / maxLevel) * 100)}%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all"
                  style={{ width: `${(level / maxLevel) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
