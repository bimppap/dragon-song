"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-4 py-10 sm:px-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/dragonsong_title.png"
        alt="Dragon Song"
        className="w-full max-w-md [image-rendering:pixelated]"
      />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>로그인</CardTitle>
          <CardDescription>아이디와 비밀번호를 입력해 주세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {errorMessage && (
              <AlertBanner>{errorMessage}</AlertBanner>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">아이디</label>
              <Input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoFocus required />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">비밀번호</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" disabled={loading}>
              <LogIn size={15} />
              {loading ? "로그인 중..." : "로그인"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
            계정이 없으신가요?{" "}
            <Link href="/signup" className="font-semibold text-amber-600 hover:underline">
              회원가입
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
