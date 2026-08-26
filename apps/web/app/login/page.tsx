"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import AlertBanner from "@/components/common/AlertBanner";

export default function LoginPage() {
  const { member, login } = useAuth();
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (member === undefined || member === null) return;
    router.replace("/");
  }, [member, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      await login({ login_id: loginId, password });
      router.replace("/");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 py-10 sm:px-6">
      <Image
        src="/dragonsong_title.png"
        alt="Dragon Song"
        width={1080}
        height={240}
        priority
        className="h-auto w-full max-w-3xl [image-rendering:pixelated]"
      />
      <Card className="w-full max-w-xs">
        <CardContent className="pt-5 pb-5">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {errorMessage && (
              <AlertBanner>{errorMessage}</AlertBanner>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wide">아이디</label>
              <Input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoFocus required />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted uppercase tracking-wide">비밀번호</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" variant="cta" disabled={loading}>
              <LogIn size={15} />
              {loading ? "로그인 중..." : "로그인"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted">
            계정이 없으신가요?{" "}
            <Link href="/signup" className="font-semibold text-gold hover:underline">
              회원가입
            </Link>
          </p>
        </CardContent>
      </Card>
      <p className="text-center text-xs leading-relaxed text-muted">
        원활한 플레이와 전체 UI 이용을 위해 PC 환경 접속을 권장합니다.
      </p>
    </main>
  );
}
