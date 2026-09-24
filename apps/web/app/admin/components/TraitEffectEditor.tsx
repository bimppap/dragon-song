"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchTraitEffectTemplates, type TraitEffectTemplate, type TraitRules } from "@/lib/api";

export default function TraitEffectEditor({ rules, disabled, onChange }: {
  rules: TraitRules | null; disabled: boolean; onChange: (rules: TraitRules) => void;
}) {
  const [templates, setTemplates] = useState<TraitEffectTemplate[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetchTraitEffectTemplates().then((value) => { if (!cancelled) setTemplates(value); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "효과 유형 조회 실패"); });
    return () => { cancelled = true; };
  }, []);
  const template = templates.find((item) => item.kind === rules?.kind);
  const preview = template?.template.replace(/\{(\w+)\}/g, (_, key: string) => String(rules?.values[key] ?? ""));
  return <FieldGroup>
    <Field>
      <FieldLabel htmlFor="trait-effect-kind">효과 유형</FieldLabel>
      <Select value={rules?.kind ?? ""} disabled={disabled || !templates.length} onValueChange={(kind) => {
        const selected = templates.find((item) => item.kind === kind);
        if (selected) onChange({ kind, values: Object.fromEntries(selected.fields.map((field) => [field.key, field.default])) });
      }}>
        <SelectTrigger id="trait-effect-kind"><SelectValue placeholder={templates.length ? "효과 유형 선택" : "불러오는 중..."} /></SelectTrigger>
        <SelectContent><SelectGroup>{templates.map((item) => <SelectItem key={item.kind} value={item.kind}>{item.name}</SelectItem>)}</SelectGroup></SelectContent>
      </Select>
    </Field>
    {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    {template && rules && <>
      <FieldGroup className="grid grid-cols-2 gap-3">
        {template.fields.map((field) => <Field key={field.key} data-disabled={disabled}>
          <FieldLabel htmlFor={`trait-value-${field.key}`}>{field.label}{field.unit && ` (${field.unit})`}</FieldLabel>
          <Input id={`trait-value-${field.key}`} type="number" required disabled={disabled} min={field.min} max={field.max} step={field.step}
            value={Number.isFinite(rules.values[field.key]) ? rules.values[field.key] : ""}
            onChange={(event) => onChange({ ...rules, values: { ...rules.values, [field.key]: event.target.value === "" ? NaN : Number(event.target.value) } })} />
        </Field>)}
      </FieldGroup>
      <p className="text-sm text-ivory" aria-live="polite">{preview}</p>
      <p className="text-xs text-muted">저장한 수치는 장착 캐릭터와 진행 중인 전투의 다음 조회·행동부터 반영됩니다. 시작 효과는 전투 시작 시 한 번만 적용됩니다.</p>
    </>}
  </FieldGroup>;
}
