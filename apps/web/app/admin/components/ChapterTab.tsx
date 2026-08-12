"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Music, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Modal from "@/components/common/Modal";
import { createChapter, fetchChapters, updateChapter, uploadChapterImage, uploadChapterMusic, type Chapter } from "@/lib/api";

interface ChapterFormState { name: string; start_date: string; end_date: string; music_url: string; }
const EMPTY_FORM: ChapterFormState = { name: "", start_date: "", end_date: "", music_url: "" };

function chapterForm(chapter: Chapter): ChapterFormState {
  return { name: chapter.name, start_date: chapter.start_date, end_date: chapter.end_date, music_url: chapter.music_url ?? "" };
}

export default function ChapterTab() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [form, setForm] = useState<ChapterFormState>(EMPTY_FORM);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<Chapter | null>(null);
  const [editForm, setEditForm] = useState<ChapterFormState>(EMPTY_FORM);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editMusicFile, setEditMusicFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchChapters().then((data) => { if (!cancelled) setChapters(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function replaceChapter(updated: Chapter) {
    setChapters((prev) => prev.map((chapter) => chapter.id === updated.id ? updated : chapter));
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.start_date || !form.end_date) return;
    setSaving(true); setError(null);
    try {
      let created = await createChapter({ ...form, name: form.name.trim(), music_url: musicFile ? null : form.music_url.trim() || null });
      if (imageFile) created = await uploadChapterImage(created.id, imageFile);
      if (musicFile) created = await uploadChapterMusic(created.id, musicFile);
      setChapters((prev) => [created, ...prev]);
      setForm(EMPTY_FORM); setImageFile(null); setMusicFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "챕터 생성 실패");
    } finally { setSaving(false); }
  }

  function openEdit(chapter: Chapter) {
    setEditing(chapter); setEditForm(chapterForm(chapter)); setEditImageFile(null); setEditMusicFile(null); setError(null);
  }

  async function handleEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing || !editForm.name.trim() || !editForm.start_date || !editForm.end_date) return;
    setSaving(true); setError(null);
    try {
      let updated = await updateChapter(editing.id, { ...editForm, name: editForm.name.trim(), music_url: editMusicFile ? editing.music_url : editForm.music_url.trim() || null });
      if (editImageFile) updated = await uploadChapterImage(updated.id, editImageFile);
      if (editMusicFile) updated = await uploadChapterMusic(updated.id, editMusicFile);
      replaceChapter(updated); setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "챕터 수정 실패");
    } finally { setSaving(false); }
  }

  return <div className="flex flex-col gap-8">
    <section className="flex flex-col gap-4 rounded-xl border border-line p-6">
      <h2 className="text-base font-semibold text-ivory">챕터 추가</h2>
      <form onSubmit={handleCreate} className="flex flex-col gap-4">
        <Input placeholder="예: 1챕터 — 어둠의 시작" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
        <div className="grid grid-cols-2 gap-4">
          <Input type="date" value={form.start_date} onChange={(event) => setForm((prev) => ({ ...prev, start_date: event.target.value }))} />
          <Input type="date" value={form.end_date} onChange={(event) => setForm((prev) => ({ ...prev, end_date: event.target.value }))} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted hover:text-ivory">
          <ImagePlus size={16} />
          <span>{imageFile ? imageFile.name : "챕터 이미지 첨부"}</span>
          <Input type="file" accept="image/*" className="hidden" onChange={(event) => setImageFile(event.target.files?.[0] ?? null)} />
        </label>
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted hover:text-ivory">
            <Music size={16} />
            <span>{musicFile ? musicFile.name : "챕터 음원 첨부 (25MB 이하)"}</span>
            <Input type="file" accept="audio/*,.mp3,.ogg,.opus,.m4a,.aac,.wav" className="hidden" onChange={(event) => setMusicFile(event.target.files?.[0] ?? null)} />
          </label>
          <Input type="url" placeholder="또는 외부 음원 URL" value={form.music_url} disabled={musicFile !== null} onChange={(event) => setForm((prev) => ({ ...prev, music_url: event.target.value }))} />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" disabled={saving} className="self-start gap-2"><Plus size={15} />{saving ? "저장 중..." : "챕터 추가"}</Button>
      </form>
    </section>

    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-ivory">챕터 목록</h2>
      {chapters.length === 0 ? <p className="text-sm text-muted">등록된 챕터가 없습니다.</p> : <div className="flex flex-col gap-2">
        {chapters.map((chapter) => <button key={chapter.id} type="button" onClick={() => openEdit(chapter)} className="flex flex-col gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-left transition-colors hover:border-gold/60 hover:bg-primary/20 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">{chapter.is_active && <Badge className="border-gold bg-gold/15 text-xs font-semibold text-gold">진행 중</Badge>}<span className="text-sm font-semibold text-ivory">{chapter.name}</span></div>
          <span className="text-xs text-muted">{chapter.start_date} ~ {chapter.end_date}</span>
        </button>)}
      </div>}
    </section>

    <Modal open={editing !== null} onClose={() => setEditing(null)} title="챕터 수정">
      <form onSubmit={handleEdit} className="flex flex-col gap-4">
        <Input value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} aria-label="챕터명" />
        <div className="grid grid-cols-2 gap-4"><Input type="date" value={editForm.start_date} onChange={(event) => setEditForm((prev) => ({ ...prev, start_date: event.target.value }))} /><Input type="date" value={editForm.end_date} onChange={(event) => setEditForm((prev) => ({ ...prev, end_date: event.target.value }))} /></div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted hover:text-ivory"><ImagePlus size={16} /><span>{editImageFile ? editImageFile.name : editing?.image_url ? "이미지 교체" : "챕터 이미지 첨부"}</span><Input type="file" accept="image/*" className="hidden" onChange={(event) => setEditImageFile(event.target.files?.[0] ?? null)} /></label>
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted hover:text-ivory"><Music size={16} /><span>{editMusicFile ? editMusicFile.name : editing?.music_url ? "첨부 음원 교체" : "챕터 음원 첨부"}</span><Input type="file" accept="audio/*,.mp3,.ogg,.opus,.m4a,.aac,.wav" className="hidden" onChange={(event) => setEditMusicFile(event.target.files?.[0] ?? null)} /></label>
          <Input type="url" placeholder="외부 음원 URL (비우면 제거)" value={editForm.music_url} disabled={editMusicFile !== null} onChange={(event) => setEditForm((prev) => ({ ...prev, music_url: event.target.value }))} />
          <p className="text-xs text-muted">첨부 파일을 선택하면 외부 링크보다 우선하며, 교체 또는 제거 시 기존 버킷 파일은 삭제됩니다.</p>
        </div>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setEditing(null)}>취소</Button><Button type="submit" disabled={saving}>{saving ? "저장 중..." : "저장"}</Button></div>
      </form>
    </Modal>
  </div>;
}
