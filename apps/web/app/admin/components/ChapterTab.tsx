"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { fetchChapters, createChapter, type Chapter } from "@/lib/api";

interface ChapterFormState {
  name: string;
  start_date: string;
  end_date: string;
}

const EMPTY_FORM: ChapterFormState = { name: "", start_date: "", end_date: "" };

export default function ChapterTab() {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [form, setForm] = useState<ChapterFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchChapters()
      .then((data) => { if (!cancelled) setChapters(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.start_date || !form.end_date) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createChapter({
        name: form.name.trim(),
        start_date: form.start_date,
        end_date: form.end_date,
      });
      setChapters((prev) => [created, ...prev]);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof Error ? err.message : "챕터 생성 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="border border-slate-200 dark:border-slate-700 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">챕터 추가</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">챕터명</label>
            <Input
              placeholder="예: 1챕터 — 어둠의 시작"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">시작 날짜</label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">종료 날짜</label>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" disabled={saving} className="self-start gap-2">
            <Plus size={15} />
            {saving ? "저장 중..." : "챕터 추가"}
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">챕터 목록</h2>
        {chapters.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">등록된 챕터가 없습니다.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {chapters.map((chapter) => (
              <div
                key={chapter.id}
                className="flex items-center justify-between border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 bg-white dark:bg-slate-900"
              >
                <div className="flex items-center gap-3">
                  {chapter.is_active && (
                    <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs font-semibold">
                      진행 중
                    </Badge>
                  )}
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{chapter.name}</span>
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {chapter.start_date} ~ {chapter.end_date}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
