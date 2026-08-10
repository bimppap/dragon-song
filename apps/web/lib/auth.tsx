"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchMe,
  login as apiLogin,
  signup as apiSignup,
  type LoginRequest,
  type Member,
  type SignupRequest,
} from "./api";
import { clearToken, getToken, setToken } from "./token";

interface AuthContextValue {
  member: Member | null | undefined; // undefined = 확인 중, null = 비로그인
  login: (data: LoginRequest) => Promise<Member>;
  signup: (data: SignupRequest) => Promise<Member>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [member, setMember] = useState<Member | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMember(null);
      return;
    }
    try {
      setMember(await fetchMe());
    } catch {
      clearToken();
      setMember(null);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function login(data: LoginRequest) {
    const res = await apiLogin(data);
    setToken(res.access_token);
    setMember(res.member);
    return res.member;
  }

  async function signup(data: SignupRequest) {
    return apiSignup(data);
  }

  function logout() {
    clearToken();
    setMember(null);
  }

  return (
    <AuthContext.Provider value={{ member, login, signup, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 AuthProvider 내부에서만 사용할 수 있습니다.");
  return ctx;
}

/** 로그인 + (RUNNER인 경우) 캐릭터 생성을 마친 회원만 통과시킨다. */
export function useRequireMember(): Member | null | undefined {
  const { member } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (member === undefined) return;
    if (member === null) {
      router.replace("/login");
      return;
    }
    if (member.role === "RUNNER" && member.character_id == null) {
      router.replace("/character/onboarding");
    }
  }, [member, router]);

  if (member === undefined) return undefined;
  if (member === null) return null;
  if (member.role === "RUNNER" && member.character_id == null) return null;
  return member;
}

/** ADMIN 권한을 가진 회원만 통과시킨다. */
export function useRequireAdmin(): Member | null | undefined {
  const { member } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (member === undefined) return;
    if (member === null) {
      router.replace("/login");
      return;
    }
    if (member.role !== "ADMIN") {
      router.replace("/");
    }
  }, [member, router]);

  if (member === undefined) return undefined;
  if (member !== null && member.role === "ADMIN") return member;
  return null;
}
