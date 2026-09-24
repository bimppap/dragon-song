"""특성 규칙, 편집 메타데이터, 문구와 전투 계산의 공통 정의.

퍼센트 입력은 10 = 10%로 저장한다. 캐릭터 원본 능력치는 변경하지 않으며,
전투에 더했던 차이만 빼고 현재 규칙을 재적용해 편집/해제 시 누적을 방지한다.
"""
import math


def field(key, label, default, unit="%", minimum=0, maximum=1000):
    return dict(key=key, label=label, default=default, unit=unit, min=minimum, max=maximum,
                step=1 if unit != "%" else 0.1)


CATALOG = {
    "meditation": ("명상", "공격 대신 명상: 사용할 때마다 치유 효율 +{heal}%, 피해 감소 +{reduction}%, 마나 최대치 +{mana_max}, 마나 +{mana}, 체력 재생력 고정 +{regen} 지속 강화.", [field("heal", "치유 효율", 10), field("reduction", "피해 감소", 5), field("mana_max", "마나 최대치", 1, ""), field("mana", "마나 회복", 1, ""), field("regen", "체력 재생력 고정", 2, "")]),
    "technique": ("기교", "기술을 사용한 뒤마다 자신에게 기술 효율 비례 +{eff}%, 고정 +{flat} 지속 강화.", [field("eff", "기술 효율 비례", 15), field("flat", "기술 효율 고정", 6, "")]),
    "distribution": ("분배", "인원 지정 기술 대상 +{targets}, 기술 비용 +{cost}, 기술 효율 비례 {eff}%, 고정 {flat}.", [field("targets", "추가 대상", 1, "", 0, 100), field("cost", "추가 비용", 1, "", -100), field("eff", "기술 효율 비례", -20, "%", -100), field("flat", "기술 효율 고정", -4, "", -1000)]),
    "offense_defense": ("공방일체", "공격·기술 행동 시 피해 감소 +{reduction}% 일회성 강화(피격 시 해제). 방어 행동 시 기술 효율 +{eff}%, 공격력 증폭 +{attack}% 지속 강화.", [field("reduction", "피격 전 피해 감소", 30), field("eff", "방어 후 기술 효율 비례", 10), field("attack", "방어 후 공격력 증폭", 10)]),
    "prepared": ("만전", "체력이 최대일 때 기술 효율 비례 +{eff}%. 전투 시작 시 약화 방지 {guard}스택(약화와 1:1 상쇄).", [field("eff", "기술 효율 비례", 25), field("guard", "시작 약화 방지 스택", 2, "", 0, 100)]),
    "hero": ("용사", "살아 있는 적 한 명당 공격력 증폭·방어력 증폭·치유 효율 +{amp}%(최대 {cap}%), 기술 효율 고정 +{flat}(최대 {flat_cap}).", [field("amp", "적당 증폭", 5), field("cap", "증폭 상한", 50), field("flat", "적당 기술 효율 고정", 1, ""), field("flat_cap", "고정 상한", 10, "")]),
    "blood": ("혈안", "기술 사용 시 마나 대신 기술 비용 × 최대 체력의 {hp}% 소모. 현재 마나 1당 기술 효율 비례 +{eff}%. 전투 시작 마나 {start_mana}.", [field("hp", "비용 1당 최대 체력 소모", 10, "%", 0, 100), field("eff", "마나당 기술 효율 비례", 5), field("start_mana", "시작 마나", 0, "")]),
    "opportunist": ("기회주의자", "자신에게 걸린 강화·약화 하나당 기술 효율 비례 +{eff}%.", [field("eff", "강화·약화당 기술 효율", 5)]),
    "preparation": ("대비", "최대 체력의 {shield}%만큼 시작 보호막. 보호막이 있을 때 존재감 +{presence}%, 피해 감소 +{reduction}%, 기술 효율 비례 +{eff}%.", [field("shield", "시작 보호막", 10), field("presence", "존재감", 20), field("reduction", "피해 감소", 5), field("eff", "기술 효율 비례", 5)]),
    "onslaught": ("맹공", "공격력 증폭 +{attack}%, 피해 감소 {reduction}%. 방어·소비 행동 사용 불가.", [field("attack", "공격력 증폭", 40), field("reduction", "피해 감소", -20, "%", -100)]),
    "standard": ("규격화", "기술 효율 고정 +{flat}.", [field("flat", "기술 효율 고정", 8, "")]),
    "peace": ("평안", "보호·치유 행동의 마나 소모 제거. 행동 시 마나 {mana} 회복.", [field("mana", "마나 회복", 1, "")]),
    "optimization": ("최적화", "기술 비용 {cost}.", [field("cost", "기술 비용 보정", -1, "", -100, 100)]),
    "heavy": ("중량화", "기술 비용 +{cost}, 기술 효율 비례 +{eff}%.", [field("cost", "추가 비용", 2, "", 0, 100), field("eff", "기술 효율 비례", 40)]),
    "undying": ("불사자", "성장 등급당 체력 재생력 고정 +{regen}. 전투 중 {uses}회, 치명적인 피해를 받아도 체력 {hp} 유지.", [field("regen", "성장 등급당 체력 재생력", 1, ""), field("uses", "생존 횟수", 1, "", 0, 100), field("hp", "생존 체력", 1, "", 1)]),
}


def templates():
    return [dict(kind=kind, name=name, template=template, fields=fields)
            for kind, (name, template, fields) in CATALOG.items()]


def default_rules(kind):
    return dict(kind=kind, values={f["key"]: f["default"] for f in CATALOG[kind][2]})


def validate_rules(rules):
    if (not isinstance(rules, dict) or set(rules) != {"kind", "values"}
            or not isinstance(rules["kind"], str) or rules["kind"] not in CATALOG):
        raise ValueError("지원하는 특성 효과 유형을 선택하세요.")
    fields = CATALOG[rules["kind"]][2]
    values = rules["values"]
    if not isinstance(values, dict) or set(values) != {f["key"] for f in fields}:
        raise ValueError("특성 효과의 수치 항목이 올바르지 않습니다.")
    for f in fields:
        value = values[f["key"]]
        if (type(value) not in (int, float) or not math.isfinite(value)
                or not f["min"] <= value <= f["max"]
                or (f["unit"] != "%" and not float(value).is_integer())):
            raise ValueError(f"{f['label']}: {f['min']}~{f['max']} 범위의 유효한 수치를 입력하세요.")
    return rules


def describe(rules):
    return CATALOG[rules["kind"]][1].format(**{k: f"{v:g}" for k, v in rules["values"].items()})


def rule(p):
    return (p.get("trait") or {}).get("rules") or {}


def kind(p):
    return rule(p).get("kind")


def values(p):
    return rule(p).get("values", {})


def sync(p, enemies=None, summons=None):
    """현재 상태의 특성 보정만 재계산하며 이미 처리된 턴은 변경하지 않는다."""
    old = p.get("_trait_deltas", {})
    for stat, delta in old.items():
        p[stat] = round(p.get(stat, 0) - delta, 8)
    k, v, delta = kind(p), values(p), {}
    def add(stat, amount):
        delta[stat] = delta.get(stat, 0) + amount
    if enemies is not None:
        p["_trait_enemy_count"] = sum(e.get("hp", 0) > 0 for e in [*enemies, *(summons or [])])
    if k == "distribution":
        delta.update(skill_target=v["targets"], skill_cost=v["cost"], skill_eff_fixed=v["eff"] / 100, skill_eff_true=v["flat"])
    elif k == "prepared" and p.get("hp", 0) >= p.get("max_hp", 1):
        add("skill_eff_fixed", v["eff"] / 100)
    elif k == "hero":
        count = p.get("_trait_enemy_count", 0)
        for stat in ("atk_p", "def_p", "heal_eff"):
            add(stat, min(v["cap"], count * v["amp"]) / 100)
        add("skill_eff_true", min(v["flat_cap"], count * v["flat"]))
    elif k == "blood":
        add("skill_eff_fixed", p.get("mp", 0) * v["eff"] / 100)
    elif k == "opportunist":
        count = sum(max(1, e.get("stacks", 1)) for e in p.get("status_effects", []) if e.get("affinity") in ("buff", "debuff"))
        count += sum(p.get("env_stacks", {}).values())
        add("skill_eff_fixed", count * v["eff"] / 100)
    elif k == "preparation" and p.get("shield", 0) > 0:
        delta.update(presence=v["presence"] / 100, dmg_r=v["reduction"] / 100, skill_eff_fixed=v["eff"] / 100)
    elif k == "onslaught":
        delta.update(atk_p=v["attack"] / 100, dmg_r=v["reduction"] / 100)
    elif k == "standard":
        add("skill_eff_true", v["flat"])
    elif k in ("optimization", "heavy"):
        add("skill_cost", v["cost"])
        if k == "heavy":
            add("skill_eff_fixed", v["eff"] / 100)
    elif k == "undying":
        add("hp_regen_true", p.get("lv", 1) * v["regen"])
    for effect in p.get("status_effects", []):
        if effect.get("effect_type") != "trait_buff" or effect.get("trait_kind") != k:
            continue
        trigger = effect["trigger"]
        if k == "meditation":
            for stat, value in dict(heal_eff=v["heal"] / 100, dmg_r=v["reduction"] / 100, max_mp=v["mana_max"], hp_regen_true=v["regen"]).items():
                add(stat, value)
        elif k == "technique":
            add("skill_eff_fixed", v["eff"] / 100)
            add("skill_eff_true", v["flat"])
        elif k == "offense_defense":
            if trigger == "defend":
                add("skill_eff_fixed", v["eff"] / 100)
                add("atk_p", v["attack"] / 100)
            else:
                add("dmg_r", v["reduction"] / 100)
    for stat, amount in delta.items():
        p[stat] = round(p.get(stat, 0) + amount, 8)
    p["_trait_deltas"] = delta
    p["mp"] = min(p.get("mp", 0), max(0, p.get("max_mp", 0)))


def start(p):
    if p.get("_trait_started"):
        return
    p["_trait_started"] = True
    k, v = kind(p), values(p)
    if k == "preparation":
        p["shield"] += math.floor(p["max_hp"] * v["shield"] / 100)
    elif k == "blood":
        p["mp"] = min(p["max_mp"], v["start_mana"])
    elif k == "prepared" and v["guard"]:
        p.setdefault("status_effects", []).append(dict(effect_type="purification_guard", affinity="buff",
            skill_name=p["trait"]["name"], stacks=int(v["guard"]), stackable=True))
    sync(p)


def trigger(p, action):
    k, v = kind(p), values(p)
    if ((k == "meditation" and action == "attack") or (k == "technique" and action == "skill")
            or (k == "offense_defense" and action in ("attack", "skill", "defend"))):
        p.setdefault("status_effects", []).append(dict(effect_type="trait_buff", affinity="buff", skill_name=p["trait"]["name"],
            trait_kind=k, trigger=action, stacks=1, stackable=True))
        sync(p)
    if k == "meditation" and action == "attack":
        p["mp"] = min(p["max_mp"], p["mp"] + v["mana"])
    if k == "peace" and action in ("protect", "heal"):
        p["mp"] = min(p["max_mp"], p["mp"] + v["mana"])


def hit(p, incoming):
    """피해 직후 1회 생존과 피격 해제. 체력 소모 행동에는 호출하지 않는다."""
    if kind(p) == "undying" and incoming > 0 and p["hp"] <= 0:
        if p.get("_trait_survival_used", 0) < values(p)["uses"]:
            p["_trait_survival_used"] = p.get("_trait_survival_used", 0) + 1
            p["hp"] = min(p["max_hp"], values(p)["hp"])
            p.setdefault("_revive_events", []).append(f"✨ {p['name']}의 {p['trait']['name']} 발동 → 체력 {p['hp']} 유지")
    p["status_effects"] = [e for e in p.get("status_effects", []) if not (
        e.get("effect_type") == "trait_buff" and e.get("trait_kind") == "offense_defense" and e.get("trigger") != "defend")]
    sync(p)


def hp_cost(p, cost):
    return math.floor(round(p["max_hp"] * values(p).get("hp", 0) * cost / 100, 8)) if kind(p) == "blood" else 0
