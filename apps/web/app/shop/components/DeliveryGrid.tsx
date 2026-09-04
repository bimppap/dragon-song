"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Copy, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Modal from "@/components/common/Modal";
import { useDialog } from "@/components/common/DialogProvider";
import { useToast } from "@/components/common/ToastProvider";
import { completeDeliveryRequest, fetchDeliveryRequests } from "@/lib/api";
import type { DeliveryRequest } from "@/lib/api";

interface Props { refreshKey: number; }

function RequestContent({ request, isGift }: { request: DeliveryRequest; isGift: boolean }) {
  const { toast } = useToast();
  const text = request.payload.note || request.payload.letter || "";
  const contentRef = useRef<HTMLParagraphElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setOverflow(element.scrollHeight > element.clientHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  async function download() {
    if (!request.payload.image_url) return;
    setDownloading(true);
    try {
      const response = await fetch(request.payload.image_url);
      if (!response.ok) throw new Error("이미지 다운로드 실패");
      const blob = await response.blob();
      const extension = blob.type.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg") || "png";
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `선물상자-${request.id}.${extension}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast("이미지를 다운로드하지 못했습니다. 잠시 후 다시 시도해 주세요.", "error");
    } finally { setDownloading(false); }
  }

  return <div className="space-y-1">
    {request.payload.image_url && <a href={request.payload.image_url} target="_blank" rel="noopener noreferrer" className="block w-fit" aria-label="첨부 이미지 원본 보기">
      <Image src={request.payload.image_url} alt="선물 상자 첨부 이미지" width={160} height={120} unoptimized className="max-h-32 w-auto max-w-full rounded-md border border-line object-contain" />
    </a>}
    <p ref={contentRef} className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted">{text || (request.payload.image_url ? "" : "내용 없음")}</p>
    {overflow && <button type="button" onClick={() => setExpanded(true)} className="text-xs text-gold hover:underline">더보기</button>}
    <div className="flex items-center gap-1">
      {isGift && <Button size="icon" variant="ghost" aria-label="이미지 다운로드" title="이미지 다운로드" disabled={downloading || !request.payload.image_url} onClick={download}><Download size={15} /></Button>}
      <Button size="icon" variant="ghost" aria-label="요청 내용 복사" title="요청 내용 복사" disabled={!text.trim()} onClick={async () => {
        try { await navigator.clipboard.writeText(text); toast("요청 내용을 복사했습니다.", "success"); }
        catch { toast("요청 내용을 복사하지 못했습니다.", "error"); }
      }}><Copy size={15} /></Button>
    </div>
    <Modal open={expanded} onClose={() => setExpanded(false)} title="요청 내용">
      <p className="whitespace-pre-wrap break-words text-sm">{text}</p>
    </Modal>
  </div>;
}

export default function DeliveryGrid({ refreshKey }: Props) {
  const { confirm } = useDialog();
  const { toast } = useToast();
  const [requests, setRequests] = useState<DeliveryRequest[]>([]);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const list = await fetchDeliveryRequests();
        if (!cancelled) setRequests(list);
      } catch (e) {
        if (!cancelled) toast(e instanceof Error ? e.message : "배달 요청 조회 실패", "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [refreshKey, toast]);

  async function handleComplete(request: DeliveryRequest) {
    const ok = await confirm({
      title: "배달 완료 처리",
      description: "정말 완료하시겠습니까?",
      confirmText: "완료",
    });
    if (!ok) return;
    setCompletingId(request.id);
    try {
      const updated = await completeDeliveryRequest(request.id);
      setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    } catch (e) {
      toast(e instanceof Error ? e.message : "완료 처리 실패", "error");
    } finally {
      setCompletingId(null);
    }
  }

  const visible = requests.filter((request) => !pendingOnly || request.status === "pending");
  const groups = [
    { title: "선물 상자", isGift: true, requests: visible.filter((request) => !request.payload.date) },
    { title: "질문권", isGift: false, requests: visible.filter((request) => !!request.payload.date) },
  ];

  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">{requests.length}건</Badge>
      <Badge variant="warning">{requests.filter((request) => request.status === "pending").length}건 대기</Badge>
      <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={pendingOnly} onChange={(event) => setPendingOnly(event.target.checked)} className="accent-gold" />
        미완료 요청만 보기
      </label>
    </div>
    {loading ? <p className="py-8 text-center text-muted">불러오는 중...</p> : groups.map((group) => <section key={group.title} className="space-y-2">
      <h3 className="font-semibold text-gold">{group.title} <span className="text-xs text-muted">{group.requests.length}건</span></h3>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[760px] table-fixed text-left text-sm">
          <thead className="bg-inset text-xs text-muted"><tr>
            <th className="w-28 p-3">발신자</th><th className="w-28 p-3">{group.isGift ? "수신자" : "요청 날짜"}</th>
            <th className="p-3">요청 내용</th>
            <th className="w-36 p-3">요청한 시간</th><th className="w-28 p-3">완료 처리</th>
          </tr></thead>
          <tbody>{group.requests.length ? group.requests.map((request) => <tr key={request.id} className="border-t border-line align-top">
            <td className="break-words p-3">{request.character_name}</td>
            <td className="break-words p-3">{group.isGift ? request.payload.recipient_name || "미지정" : request.payload.date}</td>
            <td className="p-3"><RequestContent request={request} isGift={group.isGift} /></td>
            <td className="p-3 text-xs text-muted">{new Date(request.created_at).toLocaleString("ko-KR")}</td>
            <td className="p-3"><Button size="sm" variant={request.status === "completed" ? "secondary" : "outline"}
              disabled={request.status === "completed" || completingId !== null} onClick={() => handleComplete(request)}>
              {request.status === "completed" ? "완료됨" : completingId === request.id ? "처리 중..." : "완료하기"}
            </Button></td>
          </tr>) : <tr><td colSpan={5} className="p-6 text-center text-muted">{pendingOnly ? "미완료 요청이 없습니다." : "요청이 없습니다."}</td></tr>}</tbody>
        </table>
      </div>
    </section>)}
  </div>;
}
