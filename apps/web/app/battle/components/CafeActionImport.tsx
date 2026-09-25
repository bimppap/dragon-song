"use client";

import { useState } from "react";
import { Newspaper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DatePicker from "@/components/ui/date-picker";
import TimePicker from "@/components/ui/time-picker";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/common/ToastProvider";
import { fetchNaverCafePosts, type NaverCafePostRange } from "@/lib/api";
import { parseCafeMenuId, planCafeActions, type CafeAction, type CafeActionActor } from "@/lib/cafeBattleActions";
import { joinKstDateTime, splitKstDateTime } from "@/lib/utils";

type RangeMode = "article" | "time";

interface ImportSummary {
  postCount: number;
  appliedCount: number;
  noPostNames: string[];
  needsCheck: string[];
  outsiders: string[];
}

interface Props {
  sessionId: number;
  /** 이번 턴에 행동할 캐릭터 */
  actors: CafeActionActor[];
  disabled?: boolean;
  /** 행동을 초안에 지정하고, 이번 턴에 고를 수 없어 건너뛴 행동을 돌려준다. */
  onApply: (actions: CafeAction[]) => CafeAction[];
}

/** KST 날짜·시각을 ISO 문자열로 바꾼다. 종료 시각은 그 분의 끝(59.999초)까지 포함한다. */
function kstIso(date: string, time: string, endOfMinute = false): string {
  return new Date(Date.parse(joinKstDateTime(date, time)!) + (endOfMinute ? 59_999 : 0)).toISOString();
}

function todayKst(): string {
  return splitKstDateTime(new Date().toISOString()).date;
}

// 패널은 아군 턴에만 보이므로, 라운드가 바뀌거나 새로고침해도 menuid를 다시 입력하지 않도록 이 탭에 전투별로 기억한다.
function menuIdStorageKey(sessionId: number): string {
  return `battle:${sessionId}:cafe-menu-id`;
}

function loadMenuId(sessionId: number): string {
  try {
    return sessionStorage.getItem(menuIdStorageKey(sessionId)) ?? "";
  } catch {
    return "";
  }
}

function saveMenuId(sessionId: number, menuId: string) {
  try {
    sessionStorage.setItem(menuIdStorageKey(sessionId), menuId);
  } catch {
    // 저장소를 쓸 수 없으면 이번 화면에서만 유지한다.
  }
}

function postLabel(action: CafeAction): string {
  return action.post ? `${action.name}(#${action.post.article_id} [${action.post.head_name}])` : action.name;
}

/** 전투 게시판의 말머리로 이번 턴 캐릭터 행동을 한 번에 지정한다. 글이 없는 캐릭터는 무반응이 된다. */
export default function CafeActionImport({ sessionId, actors, disabled = false, onApply }: Props) {
  const { toast } = useToast();
  const [menuId, setMenuId] = useState(() => loadMenuId(sessionId));
  const [mode, setMode] = useState<RangeMode>("article");
  const [articles, setArticles] = useState({ start: "", end: "" });
  const [times, setTimes] = useState(() => ({ startDate: todayKst(), startTime: "", endDate: todayKst(), endTime: "" }));
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const parsedMenuId = parseCafeMenuId(menuId);
  const rangeComplete = mode === "article"
    ? articles.start !== "" && articles.end !== ""
    : Object.values(times).every((value) => value !== "");
  const canImport = !disabled && !loading && parsedMenuId != null && rangeComplete;

  async function handleImport() {
    if (parsedMenuId == null) return;
    const range: NaverCafePostRange = mode === "article"
      ? { start_article_id: Number(articles.start), end_article_id: Number(articles.end) }
      : { start_at: kstIso(times.startDate, times.startTime), end_at: kstIso(times.endDate, times.endTime, true) };
    setLoading(true);
    try {
      const posts = await fetchNaverCafePosts(parsedMenuId, range);
      const plan = planCafeActions(posts, actors);
      if (!plan.actions.some((action) => action.post) && plan.unknownHeads.length === 0) {
        setSummary(null);
        toast(
          posts.length === 0
            ? "범위 안에 글이 없습니다. 게시판 menuid와 범위를 확인해 주세요."
            : "범위 안에 이번 턴 참가자가 쓴 글이 없습니다. 게시판 menuid와 범위를 확인해 주세요.",
          "error",
        );
        return;
      }
      const rejected = onApply(plan.actions);
      const rejectedSet = new Set(rejected);
      const applied = plan.actions.filter((action) => !rejectedSet.has(action));
      setSummary({
        postCount: posts.length,
        appliedCount: applied.filter((action) => action.post).length,
        noPostNames: applied.filter((action) => !action.post).map((action) => action.name),
        needsCheck: [
          ...plan.unknownHeads.map(({ name, head }) => `${name}(말머리 ${head ? `[${head}]` : "없음"})`),
          ...rejected.map((action) => `${postLabel(action)} 선택 불가`),
        ],
        outsiders: plan.outsiders,
      });
      toast("게시판 글로 행동을 지정했습니다.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "네이버 카페 게시판 조회 실패", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-line bg-inset p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-ivory">
          <Newspaper size={15} className="text-gold" />
          게시판으로 행동 지정
        </div>
        <Input
          className="h-8 w-44 text-xs"
          placeholder="게시판 menuid 또는 주소"
          value={menuId}
          onChange={(e) => {
            setMenuId(e.target.value);
            saveMenuId(sessionId, e.target.value);
          }}
        />
        <Select value={mode} onValueChange={(value: RangeMode) => setMode(value)}>
          <SelectTrigger className="h-8 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="article">글번호</SelectItem>
              <SelectItem value="time">작성 시각</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        {mode === "article" ? (
          <>
            <Input type="number" min={1} className="h-8 w-24 text-xs" placeholder="시작 번호" value={articles.start} onChange={(e) => setArticles((prev) => ({ ...prev, start: e.target.value }))} />
            <span className="text-xs text-muted">~</span>
            <Input type="number" min={1} className="h-8 w-24 text-xs" placeholder="종료 번호" value={articles.end} onChange={(e) => setArticles((prev) => ({ ...prev, end: e.target.value }))} />
          </>
        ) : (
          <>
            <DatePicker className="h-8 w-36 text-xs" value={times.startDate} onChange={(value) => setTimes((prev) => ({ ...prev, startDate: value }))} />
            <TimePicker className="h-8 w-24 text-xs" placeholder="시작 시각" minuteStep={1} value={times.startTime} onChange={(value) => setTimes((prev) => ({ ...prev, startTime: value }))} />
            <span className="text-xs text-muted">~</span>
            <DatePicker className="h-8 w-36 text-xs" value={times.endDate} onChange={(value) => setTimes((prev) => ({ ...prev, endDate: value }))} />
            <TimePicker className="h-8 w-24 text-xs" placeholder="종료 시각" minuteStep={1} value={times.endTime} onChange={(value) => setTimes((prev) => ({ ...prev, endTime: value }))} />
          </>
        )}
        <Button size="sm" onClick={handleImport} disabled={!canImport}>
          {loading ? "불러오는 중..." : "불러와서 지정"}
        </Button>
      </div>
      <p className="text-xs text-muted">
        {parsedMenuId == null
          ? "게시판 menuid를 입력해야 불러올 수 있습니다."
          : "글쓴이 이름과 말머리로 행동만 지정합니다(대상·아이템은 직접 선택). 범위 안에 글이 없는 캐릭터는 무반응이 됩니다."}
      </p>
      {summary && (
        <div className="space-y-1 text-xs">
          <p className="text-ivory">
            게시글 {summary.postCount}개 · 행동 지정 {summary.appliedCount}명 · 무반응 {summary.noPostNames.length}명
          </p>
          {summary.noPostNames.length > 0 && <p className="text-muted">글 없음 → 무반응: {summary.noPostNames.join(", ")}</p>}
          {summary.needsCheck.length > 0 && <p className="text-amber-300">직접 확인 필요: {summary.needsCheck.join(", ")}</p>}
          {summary.outsiders.length > 0 && <p className="text-muted">이번 턴 참가자가 아닌 작성자: {summary.outsiders.join(", ")}</p>}
        </div>
      )}
    </div>
  );
}
