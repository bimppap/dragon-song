"use client";

import { useEffect, useState } from "react";
import { Image as ImageIcon, PlusCircle } from "lucide-react";
import { createItem, fetchChapters, updateItem, uploadItemImage } from "@/lib/api";
import type { Chapter, Item, ItemCreate, ItemType } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import EffectListEditor from "@/components/common/EffectListEditor";
import { useDialog } from "@/components/common/DialogProvider";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NO_CHAPTER_LIMIT = "__no_limit__";

const ITEM_TYPE_OPTIONS: { value: ItemType; label: string; description: string }[] = [
  { value: "consumable", label: "소모형", description: "'사용'해야 능력치에 반영되고, 사용하면 소모됩니다." },
  { value: "equipment", label: "장착형", description: "'장착'해야 능력치에 반영되고, '해제'하면 무효화됩니다." },
];

function createEmptyItemForm(): ItemCreate {
  return {
    name: "",
    price_gold: null,
    price_cp: null,
    description_user: "",
    purchase_limit_per_character: null,
    purchase_limit_global: null,
    available_from_chapter: null,
    available_until_chapter: null,
    item_type: "consumable",
    effects: [],
  };
}

function toItemForm(item: Item | null | undefined): ItemCreate {
  if (!item) return createEmptyItemForm();
  return {
    name: item.name,
    price_gold: item.price_gold,
    price_cp: item.price_cp,
    description_user: item.description_user,
    purchase_limit_per_character: item.purchase_limit_per_character,
    purchase_limit_global: item.purchase_limit_global,
    available_from_chapter: item.available_from_chapter,
    available_until_chapter: item.available_until_chapter,
    item_type: item.item_type,
    effects: item.effects,
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
      <label className="block text-xs font-semibold text-muted uppercase tracking-wide">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function AddItemForm({ item = null, onSubmitted, onCancelEdit }: Props) {
  const { alert } = useDialog();
  const [form, setForm] = useState<ItemCreate>(() => toItemForm(item));
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(item?.image_url ?? null);
  const editingItemId = item?.id ?? null;

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : item?.image_url ?? null);
  }

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
      await alert("골드 또는 CP 중 하나 이상의 가격을 설정해야 합니다.");
      return;
    }

    setLoading(true);
    try {
      const saved = editingItemId != null ? await updateItem(editingItemId, form) : await createItem(form);
      if (imageFile) {
        await uploadItemImage(saved.id, imageFile);
      }
      await alert(editingItemId != null ? "아이템이 수정되었습니다." : "아이템이 생성되었습니다.");
      if (editingItemId == null) {
        setForm(createEmptyItemForm());
        setImageFile(null);
        setImagePreview(null);
      }
      onSubmitted();
    } catch (err: unknown) {
      await alert(err instanceof Error ? err.message : isEditMode ? "수정 실패" : "생성 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-ivory">
            {isEditMode ? "아이템 수정" : "아이템 추가"}
          </h2>
          <p className="text-sm text-muted">
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
      <p className="text-xs text-muted -mt-3">골드 또는 CP 중 하나 이상은 반드시 입력해야 합니다.</p>

      <Field label="유저용 설명">
        <Textarea
          name="description_user"
          placeholder="유저에게 표시될 설명"
          value={form.description_user}
          onChange={handleChange}
          rows={2}
        />
      </Field>

      <Field label="아이템 이미지">
        <div className="flex items-center gap-4">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-inset">
            {imagePreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagePreview} alt="아이템 이미지 미리보기" className="size-full object-cover" />
            ) : (
              <ImageIcon size={22} className="text-muted" />
            )}
          </div>
          <div className="space-y-1">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="block text-sm text-ivory/85 file:mr-3 file:rounded-lg file:border-0 file:bg-gold/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gold hover:file:bg-gold/15"
            />
            <p className="text-xs text-muted">업로드 시 자동으로 WebP로 변환되며, 5MB를 넘으면 실패합니다.</p>
          </div>
        </div>
      </Field>

      <Field label="아이템 종류" required>
        <div className="grid grid-cols-2 gap-3">
          {ITEM_TYPE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer flex-col gap-1 rounded-xl border px-3 py-3 transition-colors ${
                form.item_type === option.value
                  ? "border-gold bg-gold/10"
                  : "border-line hover:border-line"
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="item_type"
                  checked={form.item_type === option.value}
                  onChange={() => setForm((prev) => ({ ...prev, item_type: option.value }))}
                />
                <span className="font-semibold text-ivory">{option.label}</span>
              </div>
              <span className="text-xs text-muted">{option.description}</span>
            </label>
          ))}
        </div>
      </Field>

      <EffectListEditor
        effects={form.effects}
        onChange={(effects) => setForm((prev) => ({ ...prev, effects }))}
        allowSpecialStats
      />

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
      <p className="text-xs text-muted -mt-3">
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
