"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Cookie, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/common/ToastProvider";
import { checkNaverSession, fetchNaverSession, updateNaverSession } from "@/lib/api";
import type { NaverSession } from "@/lib/api";

export default function NaverSessionTab() {
  const { toast } = useToast();
  const [session, setSession] = useState<NaverSession | null>(null);
  const [nidAut, setNidAut] = useState("");
  const [nidSes, setNidSes] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchNaverSession()
      .then((data) => { if (!cancelled) setSession(data); })
      .catch((error) => { if (!cancelled) toast(error instanceof Error ? error.message : "네이버 세션 조회 실패", "error"); });
    return () => { cancelled = true; };
  }, [toast]);

  async function handleSave() {
    if (!nidAut.trim() || !nidSes.trim()) return;
    try {
      setSaving(true);
      const updated = await updateNaverSession(nidAut.trim(), nidSes.trim());
      setSession(updated);
      setNidAut("");
      setNidSes("");
      toast("네이버 세션을 저장했습니다.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "네이버 세션 저장 실패", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleCheck() {
    try {
      setChecking(true);
      const updated = await checkNaverSession();
      setSession(updated);
      toast(updated.is_valid ? "세션이 유효합니다." : "세션이 만료되었습니다.", updated.is_valid ? "success" : "error");
    } catch (error) {
      toast(error instanceof Error ? error.message : "만료 검사 실패", "error");
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cookie size={16} className="text-gold" />
          네이버 세션 쿠키
        </CardTitle>
        <CardDescription>
          출석부 자동 크롤링에 쓰는 네이버 로그인 세션 쿠키(NID_AUT, NID_SES)를 등록합니다. 값은 브라우저에서
          네이버에 로그인한 뒤 개발자도구 → 애플리케이션 → 쿠키에서 확인할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">NID_AUT</p>
            <Input
              value={nidAut}
              onChange={(event) => setNidAut(event.target.value)}
              placeholder={session?.nid_aut_masked ?? "NID_AUT 값을 붙여넣으세요"}
            />
          </div>
          <div className="flex-1 space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">NID_SES</p>
            <Input
              value={nidSes}
              onChange={(event) => setNidSes(event.target.value)}
              placeholder={session?.nid_ses_masked ?? "NID_SES 값을 붙여넣으세요"}
            />
          </div>
          <Button onClick={handleSave} disabled={!nidAut.trim() || !nidSes.trim() || saving}>
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-ground/40 p-3">
          <div className="flex-1 text-sm text-ivory/85">
            {session?.has_session ? (
              <>
                <p>NID_AUT: <span className="font-mono">{session.nid_aut_masked}</span></p>
                <p>NID_SES: <span className="font-mono">{session.nid_ses_masked}</span></p>
              </>
            ) : (
              <p className="text-muted">등록된 세션이 없습니다.</p>
            )}
            {session?.last_checked_at && (
              <p className="mt-1 text-xs text-muted">
                마지막 검사: {new Date(session.last_checked_at).toLocaleString("ko-KR")}
              </p>
            )}
          </div>
          {session?.is_valid != null && (
            <Badge variant={session.is_valid ? "success" : "destructive"} className="gap-1">
              {session.is_valid ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              {session.is_valid ? "유효함" : "만료됨"}
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheck}
            disabled={!session?.has_session || checking}
          >
            {checking ? "검사 중..." : "만료 검사"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
