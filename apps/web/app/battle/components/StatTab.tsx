import { Heart, Zap, Shield, Wind, Eye, Star } from "lucide-react";

const BASE_STATS = [
  { label: "HP", icon: Heart, value: 1250, max: 2000, color: "bg-red-400", textColor: "text-red-500" },
  { label: "MP", icon: Star, value: 430, max: 600, color: "bg-blue-400", textColor: "text-blue-500" },
  { label: "공격력", icon: Zap, value: 184, max: 400, color: "bg-orange-400", textColor: "text-orange-500" },
  { label: "방어력", icon: Shield, value: 97, max: 300, color: "bg-gold", textColor: "text-gold" },
  { label: "민첩성", icon: Wind, value: 145, max: 300, color: "bg-emerald-400", textColor: "text-emerald-500" },
  { label: "명중률", icon: Eye, value: 88, max: 100, color: "bg-gold", textColor: "text-gold" },
];

const ADDITIONAL_STATS = [
  { label: "치명타 확률", value: "12.5%" },
  { label: "치명타 피해", value: "185%" },
  { label: "회피율", value: "8.3%" },
  { label: "관통력", value: "32" },
  { label: "저항력", value: "45" },
  { label: "이동 속도", value: "110%" },
];

export default function StatTab() {
  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-ivory">캐릭터 스탯</h2>
        <p className="text-sm text-muted">현재 장비 및 버프가 적용된 최종 스탯입니다.</p>
      </div>

      {/* 기본 스탯 */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-ivory/85 uppercase tracking-wide">기본 스탯</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {BASE_STATS.map(({ label, icon: Icon, value, max, color, textColor }) => (
            <div key={label} className="border border-line rounded-xl p-4 bg-surface space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon size={15} className={textColor} />
                  <span className="text-sm font-semibold text-ivory">{label}</span>
                </div>
                <span className={`text-sm font-bold ${textColor}`}>
                  {value.toLocaleString()}
                  <span className="text-muted font-normal"> / {max.toLocaleString()}</span>
                </span>
              </div>
              <div className="h-2 bg-primary-light/20 rounded-full overflow-hidden">
                <div
                  className={`h-full ${color} rounded-full transition-all`}
                  style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 세부 스탯 */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-ivory/85 uppercase tracking-wide">세부 스탯</h3>
        <div className="border border-line rounded-xl bg-surface divide-y divide-line">
          {ADDITIONAL_STATS.map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-muted">{label}</span>
              <span className="text-sm font-bold text-ivory">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
