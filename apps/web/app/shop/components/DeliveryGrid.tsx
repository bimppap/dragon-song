"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDialog } from "@/components/common/DialogProvider";
import { useToast } from "@/components/common/ToastProvider";
import { completeDeliveryRequest, fetchDeliveryRequests } from "@/lib/api";
import type { DeliveryRequest } from "@/lib/api";

ModuleRegistry.registerModules([AllCommunityModule]);

interface Props {
  refreshKey: number;
}

function RequestContentCell({ request }: { request: DeliveryRequest }) {
  const { payload } = request;
  if (payload.date) {
    return (
      <div className="flex flex-col gap-0.5 py-1 text-xs leading-snug">
        <span className="font-semibold text-ivory">{payload.date}</span>
        <span className="whitespace-pre-line text-muted">{payload.note}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 py-1 text-xs leading-snug">
      {payload.image_url && (
        <Image src={payload.image_url} alt="첨부 이미지" width={36} height={36} className="shrink-0 rounded-md object-cover" />
      )}
      {payload.letter && <span className="whitespace-pre-line text-muted">{payload.letter}</span>}
    </div>
  );
}

export default function DeliveryGrid({ refreshKey }: Props) {
  const { confirm } = useDialog();
  const { toast } = useToast();
  const [requests, setRequests] = useState<DeliveryRequest[]>([]);
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

  const colDefs: ColDef<DeliveryRequest>[] = [
    { headerName: "요청한 캐릭터", field: "character_name", width: 150, filter: true },
    { headerName: "아이템", field: "item_name", width: 140, filter: true },
    {
      headerName: "요청 내용",
      flex: 1,
      autoHeight: true,
      cellRenderer: (p: ICellRendererParams<DeliveryRequest>) => (p.data ? <RequestContentCell request={p.data} /> : null),
    },
    {
      headerName: "요청한 시간",
      field: "created_at",
      width: 170,
      cellRenderer: (p: { value: string }) => new Date(p.value).toLocaleString("ko-KR"),
    },
    {
      headerName: "완료 처리",
      width: 130,
      cellRenderer: (p: ICellRendererParams<DeliveryRequest>) => {
        if (!p.data) return null;
        const isCompleted = p.data.status === "completed";
        return (
          <Button
            size="sm"
            variant={isCompleted ? "secondary" : "outline"}
            disabled={isCompleted || completingId === p.data.id}
            onClick={() => handleComplete(p.data!)}
          >
            {isCompleted ? "완료됨" : "완료하기"}
          </Button>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline">{requests.length}건</Badge>
        <Badge variant="warning">{requests.filter((r) => r.status === "pending").length}건 대기</Badge>
      </div>
      <div className="ag-theme-quartz overflow-hidden rounded-lg" style={{ height: 480 }}>
        <AgGridReact rowData={loading ? [] : requests} columnDefs={colDefs} rowHeight={56} />
      </div>
    </div>
  );
}
