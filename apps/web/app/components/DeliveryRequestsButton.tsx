"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useEffect, useState } from "react";
import { DELIVERY_REQUESTS_CHANGED_EVENT, fetchPendingDeliveryCount } from "@/lib/api";

const POLL_INTERVAL_MS = 30_000;

/** 관리자·스텝 헤더의 배달 요청 바로가기. 미완료 요청이 있으면 개수를 아이콘 우측 상단의 붉은 점으로 보여준다. */
export default function DeliveryRequestsButton() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      if (document.visibilityState === "hidden") return;
      try {
        const next = await fetchPendingDeliveryCount();
        if (!cancelled) setCount(next);
      } catch {
        // 배지는 보조 정보라 조회에 실패해도 화면을 방해하지 않고 다음 주기에 다시 시도한다.
      }
    }
    void refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    window.addEventListener(DELIVERY_REQUESTS_CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(DELIVERY_REQUESTS_CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const label = count > 0 ? `미완료 배달 요청 ${count}건 확인` : "배달 요청 확인";
  return (
    <Link href="/shop?view=delivery" aria-label={label} title={label}
      className="relative flex size-9 shrink-0 items-center justify-center text-ivory transition-colors hover:text-gold">
      <ShoppingCart size={20} />
      {count > 0 && (
        <span aria-hidden="true"
          className="absolute -right-1 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-num text-[10px] font-bold leading-none text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
