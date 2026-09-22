"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Package } from "lucide-react";
import Modal from "@/components/common/Modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { updateSpiritStoneCustomization, uploadSpiritStoneImage, type CharacterDetail, type CharacterOwnedItem } from "@/lib/api";

const DESCRIPTION_MAX_LENGTH = 300;

/** 정령석의 이미지·설명을 캐릭터마다 바꾸는 창. 설명을 비우면 원래 설명으로, 이미지는 되돌리기 버튼으로 복원한다. */
export default function SpiritStoneCustomizeModal({ characterId, item, onClose, onUpdated }: {
  characterId: number;
  item: CharacterOwnedItem;
  onClose: () => void;
  onUpdated: (detail: CharacterDetail) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState(item.custom_description ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<CharacterDetail>, close = false) {
    setPending(true);
    setError(null);
    try {
      onUpdated(await action());
      if (close) onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "정령석 커스텀 저장 실패");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open onClose={pending ? () => {} : onClose} title={`${item.item_name} 커스텀`}>
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <span className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line bg-gold/10 text-gold">
            {item.item_image_url
              ? <Image src={item.item_image_url} alt={item.item_name} fill sizes="96px" unoptimized className="object-contain" />
              : <Package size={28} />}
          </span>
          <div className="flex flex-col gap-2">
            <input ref={fileInput} type="file" accept="image/*" className="hidden" disabled={pending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void run(() => uploadSpiritStoneImage(characterId, item.item_id, file));
              }} />
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => fileInput.current?.click()}>
              이미지 바꾸기
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending || !item.custom_image_url}
              onClick={() => void run(() => updateSpiritStoneCustomization(characterId, item.item_id, { clear_image: true }))}>
              원래 이미지로
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="spirit-stone-description" className="block text-xs font-semibold text-muted">설명</label>
          <Textarea id="spirit-stone-description" value={description} maxLength={DESCRIPTION_MAX_LENGTH} rows={4} disabled={pending}
            placeholder="비워 두면 원래 설명이 보입니다." onChange={(event) => setDescription(event.target.value)} />
          <p className="text-right font-num text-[11px] text-muted">{description.length}/{DESCRIPTION_MAX_LENGTH}</p>
        </div>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onClose}>닫기</Button>
          <Button type="button" size="sm" disabled={pending}
            onClick={() => void run(() => updateSpiritStoneCustomization(characterId, item.item_id, { custom_description: description }), true)}>
            {pending ? "저장 중..." : "설명 저장"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
