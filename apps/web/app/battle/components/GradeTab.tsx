import { Trophy, Star, Crown, Medal, Award } from "lucide-react";

const GRADES = [
  {
    id: "bronze",
    name: "브론즈",
    icon: Medal,
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
    minScore: 0,
    maxScore: 999,
    benefits: ["기본 골드 드롭 +5%", "일반 던전 입장 가능"],
    current: false,
  },
  {
    id: "silver",
    name: "실버",
    icon: Award,
    color: "text-slate-500 dark:text-slate-400",
    bg: "bg-slate-50 dark:bg-slate-800/60",
    border: "border-slate-200 dark:border-slate-700",
    minScore: 1000,
    maxScore: 2999,
    benefits: ["골드 드롭 +10%", "일반 던전 입장 가능", "주간 보상 +1회"],
    current: false,
  },
  {
    id: "gold",
    name: "골드",
    icon: Trophy,
    color: "text-yellow-500",
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    minScore: 3000,
    maxScore: 5999,
    benefits: ["골드 드롭 +20%", "고급 던전 입장 가능", "주간 보상 +2회", "전용 칭호 지급"],
    current: true,
  },
  {
    id: "platinum",
    name: "플래티넘",
    icon: Star,
    color: "text-cyan-500",
    bg: "bg-cyan-50",
    border: "border-cyan-200",
    minScore: 6000,
    maxScore: 9999,
    benefits: ["골드 드롭 +35%", "전설 던전 입장 가능", "주간 보상 +3회", "전용 장비 해금"],
    current: false,
  },
  {
    id: "diamond",
    name: "다이아몬드",
    icon: Crown,
    color: "text-indigo-500",
    bg: "bg-indigo-50 dark:bg-indigo-950/40",
    border: "border-indigo-200",
    minScore: 10000,
    maxScore: null,
    benefits: ["골드 드롭 +50%", "모든 던전 입장 가능", "무제한 주간 보상", "전용 외형 해금", "시즌 랭킹 참가"],
    current: false,
  },
];

const CURRENT_SCORE = 3840;
const CURRENT_GRADE = GRADES.find((g) => g.current)!;
const NEXT_GRADE = GRADES[GRADES.findIndex((g) => g.current) + 1];

export default function GradeTab() {
  const progress = NEXT_GRADE
    ? ((CURRENT_SCORE - CURRENT_GRADE.minScore) / (NEXT_GRADE.minScore - CURRENT_GRADE.minScore)) * 100
    : 100;

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">등급</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">전투 점수에 따라 등급이 결정됩니다.</p>
      </div>

      {/* 현재 등급 요약 */}
      <div className="border border-yellow-200 bg-yellow-50 rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Trophy size={24} className="text-yellow-500" />
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">현재 등급</p>
            <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{CURRENT_GRADE.name}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">전투 점수</p>
            <p className="text-xl font-bold text-yellow-600">{CURRENT_SCORE.toLocaleString()}</p>
          </div>
        </div>

        {NEXT_GRADE && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>{NEXT_GRADE.name}까지 {(NEXT_GRADE.minScore - CURRENT_SCORE).toLocaleString()}점 남음</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-yellow-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-400 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 등급 목록 */}
      <div className="space-y-3">
        {GRADES.map(({ id, name, icon: Icon, color, bg, border, minScore, maxScore, benefits, current }) => (
          <div
            key={id}
            className={`border rounded-xl p-5 ${bg} ${border} ${current ? "ring-2 ring-yellow-300" : ""} transition`}
          >
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-lg bg-white dark:bg-slate-900 border ${border} flex items-center justify-center shrink-0`}>
                <Icon size={20} className={color} />
              </div>

              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`font-bold text-slate-800 dark:text-slate-100`}>{name}</span>
                  {current && (
                    <span className="text-[10px] bg-yellow-400 text-white px-2 py-0.5 rounded-full font-bold">현재</span>
                  )}
                  <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
                    {minScore.toLocaleString()}
                    {maxScore ? ` ~ ${maxScore.toLocaleString()}점` : "점 이상"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {benefits.map((b) => (
                    <span key={b} className="text-[11px] bg-white/70 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-full">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
