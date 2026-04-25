"use client";

import { useState } from "react";
import { PlusCircle } from "lucide-react";
import { createItem } from "@/lib/api";
import type { ItemCreate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const EMPTY: ItemCreate = {
  name: "",
  price: 0,
  description_user: "",
  description_internal: "",
  purchase_limit_per_character: null,
  purchase_limit_global: null,
};

interface Props {
  onCreated: () => void;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function AddItemForm({ onCreated }: Props) {
  const [form, setForm] = useState<ItemCreate>(EMPTY);
  const [loading, setLoading] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]:
        name === "price"
          ? Number(value)
          : name === "purchase_limit_per_character" || name === "purchase_limit_global"
          ? value === "" ? null : Number(value)
          : value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await createItem(form);
      alert("아이템이 생성되었습니다.");
      setForm(EMPTY);
      onCreated();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "생성 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      <Field label="아이템명" required>
        <Input
          name="name"
          required
          placeholder="ex) 체력 포션"
          value={form.name}
          onChange={handleChange}
        />
      </Field>

      <Field label="가격 (G)" required>
        <Input
          name="price"
          type="number"
          min={0}
          required
          placeholder="0"
          value={form.price}
          onChange={handleChange}
        />
      </Field>

      <Field label="유저용 설명">
        <Textarea
          name="description_user"
          placeholder="유저에게 표시될 설명"
          value={form.description_user}
          onChange={handleChange}
          rows={2}
        />
      </Field>

      <Field label="내부 설명">
        <Textarea
          name="description_internal"
          placeholder="계산/운영용 설명 (유저에게 비공개)"
          value={form.description_internal}
          onChange={handleChange}
          rows={2}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="캐릭터별 구매 한도">
          <Input
            name="purchase_limit_per_character"
            type="number"
            min={1}
            placeholder="무제한"
            value={form.purchase_limit_per_character ?? ""}
            onChange={handleChange}
          />
        </Field>
        <Field label="전체 구매 한도">
          <Input
            name="purchase_limit_global"
            type="number"
            min={1}
            placeholder="무제한"
            value={form.purchase_limit_global ?? ""}
            onChange={handleChange}
          />
        </Field>
      </div>

      <Button type="submit" disabled={loading}>
        <PlusCircle size={15} />
        {loading ? "생성 중..." : "아이템 추가"}
      </Button>
    </form>
  );
}
