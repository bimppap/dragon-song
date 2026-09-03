"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ImagePlus, Music, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DatePicker from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import Modal from "@/components/common/Modal";
import { createChapter, deleteChapter, fetchChapters, updateChapter, uploadChapterImage, uploadChapterMusic, type Chapter } from "@/lib/api";
import { useDialog } from "@/components/common/DialogProvider";

interface ChapterFormState {
  name: string;
  start_date: string;
  end_date: string;
  battle_date: string;
  music_url: string;
}

const EMPTY_FORM: ChapterFormState = { name: "", start_date: "", end_date: "", battle_date: "", music_url: "" };

function chapterForm(chapter: Chapter): ChapterFormState {
  return {
    name: chapter.name,
    start_date: chapter.start_date,
    end_date: chapter.end_date,
    battle_date: chapter.battle_date ?? "",
    music_url: chapter.music_url ?? "",
  };
}

/** 캐릭터 정보 페이지의 프로필 사진 편집 UI와 동일한 방식: 정사각형 박스에 호버 시 편집 오버레이.
 *  다만 원본 비율이 잘리지 않도록 object-contain으로 표시한다. */
function ChapterImagePicker({
  previewUrl,
  onFileChange,
}: {
  previewUrl: string | null;
  onFileChange: (file: File | null) => void;
}) {
  return (
    <div className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-inset">
      {previewUrl ? (
        // blob: 미리보기 URL은 next/image 옵티마이저가 처리할 수 없어 unoptimized로 렌더링한다.
        <Image src={previewUrl} alt="챕터 이미지 미리보기" fill unoptimized className="object-contain" />
      ) : (
        <div className="flex flex-col items-center gap-1 text-muted">
          <ImagePlus size={22} />
          <span className="text-[10px] font-medium">이미지</span>
        </div>
      )}
      <label className="group absolute inset-0 flex cursor-pointer items-center justify-center bg-ground/0 text-xs font-semibold text-ivory transition-colors hover:bg-ground/60">
        <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <ImagePlus size={12} />
          첨부
        </span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
      </label>
    </div>
  );
}

export default function ChapterTab() {
  const { confirm } = useDialog();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [form, setForm] = useState<ChapterFormState>(EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<Chapter | null>(null);
  const [editForm, setEditForm] = useState<ChapterFormState>(EMPTY_FORM);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [editMusicFile, setEditMusicFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchChapters().then((data) => { if (!cancelled) setChapters(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function replaceChapter(updated: Chapter) {
    setChapters((prev) => prev.map((chapter) => chapter.id === updated.id ? updated : chapter));
  }

  const canCreate = form.name.trim() !== "" && form.start_date !== "" && form.end_date !== "" && form.battle_date !== "";

  function openCreate() {
    setForm(EMPTY_FORM); setImageFile(null); setImagePreview(null); setMusicFile(null); setError(null);
    setCreateModalOpen(true);
  }

  function handleImageChange(file: File | null) {
    setImageFile(file);
    setImagePreview(file ? URL.createObjectURL(file) : null);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!canCreate) return;
    setSaving(true); setError(null);
    try {
      let created = await createChapter({
        ...form,
        name: form.name.trim(),
        battle_date: form.battle_date || null,
        music_url: musicFile ? null : form.music_url.trim() || null,
      });
      if (imageFile) created = await uploadChapterImage(created.id, imageFile);
      if (musicFile) created = await uploadChapterMusic(created.id, musicFile);
      setChapters((prev) => [created, ...prev]);
      setForm(EMPTY_FORM); setImageFile(null); setImagePreview(null); setMusicFile(null);
      setCreateModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "챕터 생성 실패");
    } finally { setSaving(false); }
  }

  function openEdit(chapter: Chapter) {
    setEditing(chapter); setEditForm(chapterForm(chapter));
    setEditImageFile(null); setEditImagePreview(chapter.image_url ?? null);
    setEditMusicFile(null); setError(null);
  }

  function handleEditImageChange(file: File | null) {
    setEditImageFile(file);
    setEditImagePreview(file ? URL.createObjectURL(file) : editing?.image_url ?? null);
  }

  async function handleEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || !editForm.name.trim() || !editForm.start_date || !editForm.end_date) return;
    setSaving(true); setError(null);
    try {
      let updated = await updateChapter(editing.id, {
        ...editForm,
        name: editForm.name.trim(),
        battle_date: editForm.battle_date || null,
        music_url: editMusicFile ? editing.music_url : editForm.music_url.trim() || null,
      });
      if (editImageFile) updated = await uploadChapterImage(updated.id, editImageFile);
      if (editMusicFile) updated = await uploadChapterMusic(updated.id, editMusicFile);
      replaceChapter(updated); setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "챕터 수정 실패");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!editing) return;
    const ok = await confirm({
      title: "챕터 삭제",
      description: "관련된 정보가 전부 사라집니다. 삭제하시겠습니까?",
      confirmText: "삭제",
      tone: "danger",
    });
    if (!ok) return;
    setDeleting(true); setError(null);
    try {
      await deleteChapter(editing.id);
      setChapters((prev) => prev.filter((c) => c.id !== editing.id));
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "챕터 삭제 실패");
    } finally { setDeleting(false); }
  }

  return <div className="flex flex-col gap-8">
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ivory">챕터 목록</h2>
        <Button type="button" onClick={openCreate} className="gap-2">
          <Plus size={15} />
          챕터 추가
        </Button>
      </div>
      {chapters.length === 0 ? <p className="text-sm text-muted">등록된 챕터가 없습니다.</p> : <div className="flex flex-col gap-2">
        {chapters.map((chapter) => <button key={chapter.id} type="button" onClick={() => openEdit(chapter)} className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-gold/60 hover:bg-primary/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">{chapter.is_active && <Badge className="border-gold bg-gold/15 text-xs font-semibold text-gold">진행 중</Badge>}<span className="text-sm font-semibold text-ivory">{chapter.name}</span></div>
          <span className="text-xs text-muted">{chapter.start_date} ~ {chapter.end_date} · 전투 {chapter.battle_date ?? "미정"}</span>
        </button>)}
      </div>}
    </section>

    <Modal open={createModalOpen} onClose={() => setCreateModalOpen(false)} title="챕터 추가">
      <form onSubmit={handleCreate} className="flex flex-col gap-4">
        <Input placeholder="예: 1챕터 — 어둠의 시작" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} aria-label="챕터명" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-sm text-muted">시작</span>
          <DatePicker className="min-w-0 flex-1" value={form.start_date} onChange={(value) => setForm((prev) => ({ ...prev, start_date: value }))} />
          <span className="shrink-0 text-sm text-muted">~ 종료</span>
          <DatePicker className="min-w-0 flex-1" value={form.end_date} onChange={(value) => setForm((prev) => ({ ...prev, end_date: value }))} />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-sm text-muted">전투 일정</span>
          <DatePicker className="min-w-0 flex-1" value={form.battle_date} onChange={(value) => setForm((prev) => ({ ...prev, battle_date: value }))} />
        </div>

        <div className="flex items-center gap-4">
          <ChapterImagePicker previewUrl={imagePreview} onFileChange={handleImageChange} />
          <span className="text-sm text-muted">{imageFile ? imageFile.name : "챕터 이미지 첨부"}</span>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted hover:text-ivory">
            <Music size={16} />
            <span>{musicFile ? musicFile.name : "챕터 음원 첨부 (25MB 이하)"}</span>
            <Input type="file" accept="audio/*,.mp3,.ogg,.opus,.m4a,.aac,.wav" className="hidden" onChange={(event) => setMusicFile(event.target.files?.[0] ?? null)} />
          </label>
          <Input type="url" placeholder="또는 외부 음원 URL" value={form.music_url} disabled={musicFile !== null} onChange={(event) => setForm((prev) => ({ ...prev, music_url: event.target.value }))} />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setCreateModalOpen(false)}>취소</Button>
          <Button type="submit" disabled={saving || !canCreate} className="gap-2">
            <Plus size={15} />
            {saving ? "저장 중..." : "챕터 추가"}
          </Button>
        </div>
      </form>
    </Modal>

    <Modal open={editing !== null} onClose={() => setEditing(null)} title="챕터 수정">
      <form onSubmit={handleEdit} className="flex flex-col gap-4">
        <Input value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} aria-label="챕터명" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 text-sm text-muted">시작</span>
          <DatePicker className="min-w-0 flex-1" value={editForm.start_date} onChange={(value) => setEditForm((prev) => ({ ...prev, start_date: value }))} />
          <span className="shrink-0 text-sm text-muted">~ 종료</span>
          <DatePicker className="min-w-0 flex-1" value={editForm.end_date} onChange={(value) => setEditForm((prev) => ({ ...prev, end_date: value }))} />
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-sm text-muted">전투 일정</span>
          <DatePicker className="min-w-0 flex-1" value={editForm.battle_date} onChange={(value) => setEditForm((prev) => ({ ...prev, battle_date: value }))} />
        </div>

        <div className="flex items-center gap-4">
          <ChapterImagePicker previewUrl={editImagePreview} onFileChange={handleEditImageChange} />
          <span className="text-sm text-muted">{editImageFile ? editImageFile.name : editing?.image_url ? "이미지 교체" : "챕터 이미지 첨부"}</span>
        </div>

        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted hover:text-ivory"><Music size={16} /><span>{editMusicFile ? editMusicFile.name : editing?.music_url ? "첨부 음원 교체" : "챕터 음원 첨부"}</span><Input type="file" accept="audio/*,.mp3,.ogg,.opus,.m4a,.aac,.wav" className="hidden" onChange={(event) => setEditMusicFile(event.target.files?.[0] ?? null)} /></label>
          <Input type="url" placeholder="외부 음원 URL (비우면 제거)" value={editForm.music_url} disabled={editMusicFile !== null} onChange={(event) => setEditForm((prev) => ({ ...prev, music_url: event.target.value }))} />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={saving || deleting}>
            <Trash2 size={15} />
            {deleting ? "삭제 중..." : "삭제"}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>취소</Button>
            <Button type="submit" disabled={saving || deleting}>{saving ? "저장 중..." : "저장"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  </div>;
}
