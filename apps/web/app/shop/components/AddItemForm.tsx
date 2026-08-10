"use client";

import { useEffect, useState } from "react";
import { PlusCircle } from "lucide-react";
import { createItem, fetchChapters, updateItem } from "@/lib/api";
import type { Chapter, Item, ItemCreate } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NO_CHAPTER_LIMIT = "__no_limit__";

function createEmptyItemForm(): ItemCreate {
  return {
    name: "",
    price_gold: null,
    price_cp: null,
    description_user: "",
    description_internal: "",
    purchase_limit_per_character: null,
    purchase_limit_global: null,
    available_from_chapter: null,
    available_until_chapter: null,
  };
}

function toItemForm(item: Item | null | undefined): ItemCreate {
  if (!item) return createEmptyItemForm();
  return {
    name: item.name,
    price_gold: item.price_gold,
    price_cp: item.price_cp,
    description_user: item.description_user,
    description_internal: item.description_internal,
    purchase_limit_per_character: item.purchase_limit_per_character,
    purchase_limit_global: item.purchase_limit_global,
    available_from_chapter: item.available_from_chapter,
    available_until_chapter: item.available_until_chapter,
  };
}

interface Props {
  item?: Item | null;
  onSubmitted: () => void;
  onCancelEdit?: () => void;
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

export default function AddItemForm({ item = null, onSubmitted, onCancelEdit }: Props) {
  const [form, setForm] = useState<ItemCreate>(() => toItemForm(item));
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(false);
  const editingItemId = item?.id ?? null;

  useEffect(() => {
    fetchChapters().then(setChapters).catch(console.error);
  }, []);

  const isEditMode = editingItemId != null;

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]:
        name === "price_gold" ||
        name === "price_cp" ||
        name === "purchase_limit_per_character" ||
        name === "purchase_limit_global"
          ? value === "" ? null : Number(value)
          : value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.price_gold && !form.price_cp) {
      alert("골드 또는 CP 중 하나 이상의 가격을 설정해야 합니다.");
      return;
    }

    setLoading(true);
    try {
      if (editingItemId != null) {
        await updateItem(editingItemId, form);
        alert("아이템이 수정되었습니다.");
      } else {
        await createItem(form);
        alert("아이템이 생성되었습니다.");
        setForm(createEmptyItemForm());
      }
      onSubmitted();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : isEditMode ? "수정 실패" : "생성 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">
            {isEditMode ? "아이템 수정" : "아이템 추가"}
          </h2>
          <p className="text-sm text-slate-500">
            {editingItemId != null
              ? `아이템 #${editingItemId}의 정보를 수정합니다.`
              : "상점에 새 아이템을 등록합니다."}
          </p>
        </div>
        {isEditMode && (
          <Button type="button" variant="outline" onClick={onCancelEdit}>
            새 아이템 입력
          </Button>
        )}
      </div>

      <Field label="아이템명" required>
        <Input
          name="name"
          required
          placeholder="ex) 체력 포션"
          value={form.name}
          onChange={handleChange}
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="가격 (골드)">
          <Input
            name="price_gold"
            type="number"
            min={0}
            placeholder="미사용"
            value={form.price_gold ?? ""}
            onChange={handleChange}
          />
        </Field>
        <Field label="가격 (CP)">
          <Input
            name="price_cp"
            type="number"
            min={0}
            placeholder="미사용"
            value={form.price_cp ?? ""}
            onChange={handleChange}
          />
        </Field>
      </div>
      <p className="text-xs text-slate-400 -mt-3">골드 또는 CP 중 하나 이상은 반드시 입력해야 합니다.</p>

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

      <div className="grid grid-cols-2 gap-4">
        <Field label="시작 챕터">
          <Select
            value={form.available_from_chapter ?? NO_CHAPTER_LIMIT}
            onValueChange={(value) =>
              setForm((prev) => ({
                ...prev,
                available_from_chapter: value === NO_CHAPTER_LIMIT ? null : value,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="제한 없음" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NO_CHAPTER_LIMIT}>제한 없음</SelectItem>
                {chapters.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field label="종료 챕터">
          <Select
            value={form.available_until_chapter ?? NO_CHAPTER_LIMIT}
            onValueChange={(value) =>
              setForm((prev) => ({
                ...prev,
                available_until_chapter: value === NO_CHAPTER_LIMIT ? null : value,
              }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="제한 없음" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NO_CHAPTER_LIMIT}>제한 없음</SelectItem>
                {chapters.map((c) => (
                  <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <p className="text-xs text-slate-400 -mt-3">
        둘 다 제한 없음이면 항상 구매 가능. 시작 챕터만 지정하면 해당 챕터부터, 둘 다 같은 챕터로 지정하면 그 챕터에서만 구매 가능합니다.
      </p>

      <Button type="submit" disabled={loading}>
        <PlusCircle size={15} />
        {loading
          ? isEditMode ? "수정 중..." : "생성 중..."
          : isEditMode ? "아이템 수정" : "아이템 추가"}
      </Button>
    </form>
  );
}
