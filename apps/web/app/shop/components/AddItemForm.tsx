"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Image as ImageIcon, PlusCircle, Trash2, X } from "lucide-react";
import { createItem, deleteItem, fetchChapters, fetchMissions, updateItem, uploadItemImage } from "@/lib/api";
import type { Chapter, Item, ItemCreate, ItemType, Mission, SalePeriodType } from "@/lib/api";
import { joinKstDateTime, splitKstDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import DatePicker from "@/components/ui/date-picker";
import TimePicker from "@/components/ui/time-picker";
import EffectListEditor from "@/components/common/EffectListEditor";
import { useDialog } from "@/components/common/DialogProvider";
import { useToast } from "@/components/common/ToastProvider";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NO_CHAPTER_LIMIT = "__no_limit__";
const NO_MISSION_LIMIT = "__no_mission__";

/** 특수 상인 아이템에서만 선택할 수 있다(일반 아이템은 항상 소모형). */
const SPECIAL_MERCHANT_ITEM_TYPE_OPTIONS: { value: ItemType; label: string }[] = [
  { value: "companion", label: "동반자" },
  { value: "accessory", label: "장신구" },
];

/** 구매 전/후 이미지 입력에 같은 모양을 쓰기 위한 미리보기+파일 선택 칸. */
function ItemImageInput({ label, previewUrl, onFileChange }: {
  label: string;
  previewUrl: string | null;
  onFileChange: (file: File | null) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-inset">
        {previewUrl ? (
          // blob: 미리보기 URL은 next/image 옵티마이저가 처리할 수 없어 unoptimized로 렌더링한다.
          <Image src={previewUrl} alt={`${label} 미리보기`} fill unoptimized className="object-cover" />
        ) : (
          <ImageIcon size={22} className="text-muted" />
        )}
      </div>
      {/* 선택한 파일명은 미리보기로 충분해 보여주지 않는다. 기본 파일 입력은 숨기고 버튼 모양 label로 연다. */}
      <label className="shrink-0 cursor-pointer rounded-lg bg-gold/10 px-3 py-1.5 text-sm font-semibold text-gold transition-colors hover:bg-gold/15 focus-within:ring-2 focus-within:ring-gold">
        이미지 선택
        <input
          type="file"
          accept="image/*"
          aria-label={label}
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
          className="sr-only"
        />
      </label>
    </div>
  );
}

function createEmptyItemForm(): ItemCreate {
  return {
    name: "",
    price_gold: null,
    price_cp: null,
    description_user: "",
    special_merchant: false,
    name_after_purchase: "",
    description_after_purchase: "",
    purchase_limit_per_character: null,
    purchase_limit_global: null,
    available_from_chapter: null,
    available_until_chapter: null,
    sale_period_type: "chapter",
    available_from_at: null,
    available_until_at: null,
    item_type: "consumable",
    restricted_mission_id: null,
    effects: [],
    sale_paused: false,
    battle_only: false,
    battle_unusable: false,
  };
}

function toItemForm(item: Item | null | undefined): ItemCreate {
  if (!item) return createEmptyItemForm();
  return {
    name: item.name,
    price_gold: item.price_gold,
    price_cp: item.price_cp,
    description_user: item.description_user,
    special_merchant: item.special_merchant,
    name_after_purchase: item.name_after_purchase,
    description_after_purchase: item.description_after_purchase,
    purchase_limit_per_character: item.purchase_limit_per_character,
    purchase_limit_global: item.purchase_limit_global,
    available_from_chapter: item.available_from_chapter,
    available_until_chapter: item.available_until_chapter,
    sale_period_type: item.sale_period_type,
    available_from_at: item.available_from_at,
    available_until_at: item.available_until_at,
    item_type: item.item_type,
    restricted_mission_id: item.restricted_mission_id,
    effects: item.effects,
    sale_paused: item.sale_paused,
    battle_only: item.battle_only,
    battle_unusable: item.battle_unusable,
  };
}

/** 날짜 방식 판매기간의 입력 중 값. 날짜와 시각을 따로 고를 수 있어 제출 시점에 ISO로 합친다. */
interface SaleDateDraft {
  fromDate: string;
  fromTime: string;
  untilDate: string;
  untilTime: string;
}

function toSaleDateDraft(item: Item | null | undefined): SaleDateDraft {
  const from = splitKstDateTime(item?.available_from_at ?? null);
  const until = splitKstDateTime(item?.available_until_at ?? null);
  return { fromDate: from.date, fromTime: from.time, untilDate: until.date, untilTime: until.time };
}

const SALE_PERIOD_TYPE_OPTIONS: { value: SalePeriodType; label: string }[] = [
  { value: "chapter", label: "챕터" },
  { value: "date", label: "날짜" },
];

interface Props {
  item?: Item | null;
  onSubmitted: () => void;
  onDeleted?: () => void;
  /** 머리글 제목. 제목 옆에 특수 상인 설정을, 오른쪽 끝에 닫기 버튼을 둔다(모달 자체 제목 대신 사용). */
  title: string;
  onClose?: () => void;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[13px] font-semibold text-ivory/90">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

/** 입력 묶음. 모달 바탕(surface)과 확실히 구분되도록 어두운 인셋 바탕과 진한 테두리, 금색 표식이 붙은 제목을 쓴다. */
function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-primary bg-inset p-4">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h3 className="border-l-2 border-gold pl-2 text-sm font-bold text-ivory">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function AddItemForm({ item = null, onSubmitted, onDeleted, title, onClose }: Props) {
  const { alert, confirm } = useDialog();
  const { toast } = useToast();
  const [form, setForm] = useState<ItemCreate>(() => toItemForm(item));
  const [saleDates, setSaleDates] = useState<SaleDateDraft>(() => toSaleDateDraft(item));
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(item?.image_url ?? null);
  const [afterImageFile, setAfterImageFile] = useState<File | null>(null);
  const [afterImagePreview, setAfterImagePreview] = useState<string | null>(item?.image_after_purchase_url ?? null);
  // Release local previews when replaced or when the form closes.
  useEffect(() => () => { if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview); }, [imagePreview]);
  useEffect(() => () => { if (afterImagePreview?.startsWith("blob:")) URL.revokeObjectURL(afterImagePreview); }, [afterImagePreview]);
  const [createdItemId, setCreatedItemId] = useState<number | null>(null);
  const editingItemId = item?.id ?? createdItemId;

  async function handleDelete() {
    if (editingItemId == null) return;
    const ok = await confirm({
      title: "아이템 삭제",
      description: "관련된 정보가 전부 사라집니다. 삭제하시겠습니까?",
      confirmText: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteItem(editingItemId);
      onDeleted?.();
    } catch (error) {
      toast(error instanceof Error ? error.message : "아이템 삭제에 실패했습니다.", "error");
    } finally {
      setDeleting(false);
    }
  }

  function handleImageChange(file: File | null) {
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : item?.image_url ?? null);
  }

  useEffect(() => {
    fetchChapters().then(setChapters).catch(console.error);
    fetchMissions().then(setMissions).catch(console.error);
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

    let payload = form;
    if (form.sale_period_type === "date") {
      if ((saleDates.fromTime && !saleDates.fromDate) || (saleDates.untilTime && !saleDates.untilDate)) {
        await alert("판매기간의 시각을 지정하려면 날짜도 선택해야 합니다.");
        return;
      }
      const availableFromAt = joinKstDateTime(saleDates.fromDate, saleDates.fromTime);
      const availableUntilAt = joinKstDateTime(saleDates.untilDate, saleDates.untilTime);
      if (availableFromAt && availableUntilAt && new Date(availableFromAt) >= new Date(availableUntilAt)) {
        await alert("판매 시작 일시는 종료 일시보다 빨라야 합니다.");
        return;
      }
      payload = { ...form, available_from_at: availableFromAt, available_until_at: availableUntilAt };
    }

    setLoading(true);
    try {
      const saved = editingItemId != null ? await updateItem(editingItemId, payload) : await createItem(payload);
      if (editingItemId == null) setCreatedItemId(saved.id);
      if (imageFile) {
        await uploadItemImage(saved.id, imageFile);
      }
      if (form.special_merchant && afterImageFile) await uploadItemImage(saved.id, afterImageFile, "after");
      await alert(editingItemId != null ? "아이템이 수정되었습니다." : "아이템이 생성되었습니다.");
      if (item == null) {
        setCreatedItemId(null);
        setAfterImageFile(null);
        setAfterImagePreview(null);
        setForm(createEmptyItemForm());
        setSaleDates(toSaleDateDraft(null));
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
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-start justify-between gap-3 border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <h2 className="text-base font-bold text-ivory">{title}</h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ivory">
            <Checkbox
              checked={form.special_merchant}
              onCheckedChange={(checked) => setForm((prev) => ({
                ...prev, special_merchant: checked === true,
                item_type: checked === true ? (prev.item_type === "accessory" ? "accessory" : "companion") : "consumable",
                battle_only: checked === true ? false : prev.battle_only,
                battle_unusable: checked === true ? false : prev.battle_unusable,
              }))}
            />
            특수 상인 판매 물건
          </label>
          {form.special_merchant && (
            <RadioGroup
              aria-label="아이템 종류"
              className="flex gap-4"
              value={form.item_type}
              onValueChange={(value) => setForm((prev) => ({ ...prev, item_type: value as ItemType, battle_only: false, battle_unusable: false }))}
            >
              {SPECIAL_MERCHANT_ITEM_TYPE_OPTIONS.map((option) => (
                <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm text-ivory">
                  <RadioGroupItem value={option.value} />
                  {option.label}
                </label>
              ))}
            </RadioGroup>
          )}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted transition-colors hover:bg-primary-light/20 hover:text-ivory"
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        )}
      </div>

      {/* 넓은 화면에서는 기본 정보·이미지(왼쪽)와 효과·판매 조건(오른쪽)을 나란히 두어 스크롤 없이 한 번에 보이게 한다. */}
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-x-8">
        <div className="min-w-0 space-y-5">
          <Section title="기본 정보">
            <div className={form.special_merchant ? "grid grid-cols-2 gap-4" : undefined}>
              <Field label={form.special_merchant ? "아이템명 (구매 전)" : "아이템명"} required>
                <Input
                  name="name"
                  required
                  placeholder="ex) 체력 포션"
                  value={form.name}
                  onChange={handleChange}
                />
              </Field>
              {form.special_merchant && (
                <Field label="아이템명 (구매 후)">
                  <Input name="name_after_purchase" placeholder={form.name ? `비워두면 "${form.name}"` : "비워두면 구매 전 이름"} value={form.name_after_purchase} onChange={handleChange} />
                </Field>
              )}
            </div>

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
            <p className="-mt-2 text-xs text-muted">골드 또는 CP 중 하나 이상은 반드시 입력해야 합니다.</p>
          </Section>

          <Section title="설명">
            <div className={form.special_merchant ? "grid grid-cols-2 gap-4" : undefined}>
              <Field label={form.special_merchant ? "유저용 설명 (구매 전)" : "유저용 설명"}>
                <Textarea
                  name="description_user"
                  placeholder="유저에게 표시될 설명"
                  value={form.description_user}
                  onChange={handleChange}
                  rows={3}
                />
              </Field>
              {form.special_merchant && (
                <Field label="유저용 설명 (구매 후)">
                  <Textarea name="description_after_purchase" placeholder="비워두면 구매 전 설명" value={form.description_after_purchase} onChange={handleChange} rows={3} />
                </Field>
              )}
            </div>
          </Section>

          <Section title="이미지">
            <div className={form.special_merchant ? "grid grid-cols-2 gap-4" : undefined}>
              <Field label={form.special_merchant ? "아이템 이미지 (구매 전)" : "아이템 이미지"}>
                <ItemImageInput label={form.special_merchant ? "아이템 이미지 (구매 전)" : "아이템 이미지"} previewUrl={imagePreview} onFileChange={handleImageChange} />
              </Field>
              {form.special_merchant && (
                <Field label="아이템 이미지 (구매 후)">
                  <ItemImageInput
                    label="아이템 이미지 (구매 후)"
                    previewUrl={afterImagePreview}
                    onFileChange={(file) => {
                      setAfterImageFile(file);
                      setAfterImagePreview(file ? URL.createObjectURL(file) : item?.image_after_purchase_url ?? null);
                    }}
                  />
                </Field>
              )}
            </div>
          </Section>
        </div>

        <div className="min-w-0 space-y-5">
          <EffectListEditor
            effects={form.effects}
            onChange={(effects) => setForm((prev) => ({ ...prev, effects }))}
            allowSpecialStats={form.item_type === "consumable"}
            allowGradeChoice={form.item_type === "accessory"}
            allowEquipPassives={form.item_type !== "consumable"}
            chapters={chapters}
          />

          <Section title="구매 조건">
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

            <Field label="구매 제한 임무">
              <Select
                value={form.restricted_mission_id != null ? String(form.restricted_mission_id) : NO_MISSION_LIMIT}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    restricted_mission_id: value === NO_MISSION_LIMIT ? null : Number(value),
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="제한 없음" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NO_MISSION_LIMIT}>제한 없음</SelectItem>
                    {missions.map((mission) => (
                      <SelectItem key={mission.id} value={String(mission.id)}>
                        {mission.chapter}|{mission.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <p className="-mt-2 text-xs text-muted">
              임무를 지정하면 해당 임무의 보상을 받은 캐릭터는 이 아이템을 구매할 수 없습니다.
            </p>
          </Section>

          <Section
            title="판매기간"
            action={
              <div className="flex gap-1">
                {SALE_PERIOD_TYPE_OPTIONS.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    variant={form.sale_period_type === option.value ? "default" : "outline"}
                    aria-pressed={form.sale_period_type === option.value}
                    onClick={() => setForm((prev) => ({ ...prev, sale_period_type: option.value }))}
                    className="h-7 px-3 text-xs"
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            }
          >
              {form.sale_period_type === "chapter" ? (
                <>
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
                  <p className="-mt-2 text-xs text-muted">
                    둘 다 제한 없음이면 항상 구매 가능. 시작 챕터만 지정하면 해당 챕터부터, 둘 다 같은 챕터로 지정하면 그 챕터에서만 구매 가능합니다.
                  </p>
                </>
              ) : (
                <>
                  <Field label="시작 일시">
                    <div className="flex items-center gap-2">
                      <DatePicker
                        className="min-w-0 flex-1"
                        placeholder="제한 없음"
                        clearable
                        value={saleDates.fromDate || null}
                        onChange={(value) => setSaleDates((prev) => ({ ...prev, fromDate: value, fromTime: value ? prev.fromTime : "" }))}
                      />
                      <TimePicker
                        className="w-32 shrink-0"
                        placeholder="00:00"
                        minuteStep={1}
                        value={saleDates.fromTime}
                        onChange={(value) => setSaleDates((prev) => ({ ...prev, fromTime: value }))}
                      />
                    </div>
                  </Field>
                  <Field label="종료 일시">
                    <div className="flex items-center gap-2">
                      <DatePicker
                        className="min-w-0 flex-1"
                        placeholder="제한 없음"
                        clearable
                        value={saleDates.untilDate || null}
                        onChange={(value) => setSaleDates((prev) => ({ ...prev, untilDate: value, untilTime: value ? prev.untilTime : "" }))}
                      />
                      <TimePicker
                        className="w-32 shrink-0"
                        placeholder="00:00"
                        minuteStep={1}
                        value={saleDates.untilTime}
                        onChange={(value) => setSaleDates((prev) => ({ ...prev, untilTime: value }))}
                      />
                    </div>
                  </Field>
                  <p className="-mt-2 text-xs text-muted">
                    한국 시간 기준입니다. 시작 일시부터 구매할 수 있고, 종료 일시가 되면 판매가 끝납니다. 시각을 비우면 00:00으로 저장되며, 초는 항상 00초입니다.
                  </p>
                </>
              )}
          </Section>

          <Section title="공개·사용 설정">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ivory">
              <Checkbox
                checked={form.sale_paused}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, sale_paused: checked === true }))}
              />
              <span className="font-semibold">비공개</span>
              <span className="text-xs text-muted">판매를 멈추고 러너에게 노출하지 않습니다.</span>
            </label>

            {/* 두 설정은 서로 반대라 하나를 켜면 다른 하나는 꺼진다. */}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ivory">
                <Checkbox
                  disabled={form.item_type !== "consumable"}
                  checked={form.battle_only}
                  onCheckedChange={(checked) => setForm((prev) => ({
                    ...prev, battle_only: checked === true, battle_unusable: checked === true ? false : prev.battle_unusable,
                  }))}
                />
                <span className="font-semibold">전투 중에만 사용 가능</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ivory">
                <Checkbox
                  disabled={form.item_type !== "consumable"}
                  checked={form.battle_unusable}
                  onCheckedChange={(checked) => setForm((prev) => ({
                    ...prev, battle_unusable: checked === true, battle_only: checked === true ? false : prev.battle_only,
                  }))}
                />
                <span className="font-semibold">전투 중에 사용 불가</span>
              </label>
            </div>
          </Section>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-line pt-4">
        <Button type="submit" disabled={loading || deleting} className="flex-1">
          <PlusCircle size={15} />
          {loading
            ? isEditMode ? "수정 중..." : "생성 중..."
            : isEditMode ? "아이템 수정" : "아이템 추가"}
        </Button>
        {isEditMode && (
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={loading || deleting}>
            <Trash2 size={15} />
            {deleting ? "삭제 중..." : "삭제"}
          </Button>
        )}
      </div>
    </form>
  );
}
