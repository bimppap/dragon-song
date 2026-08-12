"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserPlus } from "lucide-react";
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

export default function SignupPage() {
  const { member, signup } = useAuth();
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (member === undefined || member === null) return;
    router.replace("/");
  }, [member, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (password !== passwordConfirm) {
      setErrorMessage("비밀번호가 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    try {
      await signup({ login_id: loginId, password, password_confirm: passwordConfirm });
      router.replace("/login");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "회원가입에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-sm px-4 py-12 sm:px-6 sm:py-20">
      <Card>
        <CardHeader>
          <CardTitle>회원가입</CardTitle>
          <CardDescription>아이디와 비밀번호를 입력해 계정을 만드세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {errorMessage && (
              <AlertBanner>{errorMessage}</AlertBanner>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">아이디</label>
              <Input
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                minLength={3}
                autoFocus
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">비밀번호</label>
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={4}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">비밀번호 확인</label>
              <PasswordInput
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                minLength={4}
                required
              />
            </div>

            <Button type="submit" disabled={loading}>
              <UserPlus size={15} />
              {loading ? "가입 중..." : "회원가입"}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500 dark:text-slate-400">
            이미 계정이 있으신가요?{" "}
            <Link href="/login" className="font-semibold text-amber-600 hover:underline">
              로그인
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
