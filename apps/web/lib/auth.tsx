"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  fetchMe,
  login as apiLogin,
  logoutRequest,
  signup as apiSignup,
  SESSION_EXPIRED_EVENT,
  type LoginRequest,
  type Member,
  type MemberRole,
  type SignupRequest,
} from "./api";
import { clearToken, getRefreshToken, getToken, setRefreshToken, setToken } from "./token";

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
    let cancelled = false;

    async function loadInitialMember() {
      if (!getToken()) {
        if (!cancelled) setMember(null);
        return;
      }
      try {
        const me = await fetchMe();
        if (!cancelled) setMember(me);
      } catch {
        if (!cancelled) {
          clearToken();
          setMember(null);
        }
      }
    }

    loadInitialMember();
    return () => { cancelled = true; };
  }, []);

  // API 호출 중 refresh token이 없거나 만료/무효화된 것으로 확인되면(lib/api.ts) 즉시 로그아웃 상태로
  // 전환한다. 각 페이지의 useRequireMember/useRequireAdmin이 이 변화를 보고 /login으로 리다이렉트한다.
  useEffect(() => {
    function handleSessionExpired() {
      setMember(null);
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  async function login(data: LoginRequest) {
    const res = await apiLogin(data);
    setToken(res.access_token);
    setRefreshToken(res.refresh_token);
    setMember(res.member);
    return res.member;
  }

  async function signup(data: SignupRequest) {
    return apiSignup(data);
  }

  function logout() {
    const refreshToken = getRefreshToken();
    clearToken();
    setMember(null);
    if (refreshToken) {
      // 서버 쪽 refresh token도 무효화한다. 실패해도 로컬 로그아웃은 이미 끝난 상태라 무시한다.
      logoutRequest(refreshToken).catch(() => {});
    }
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

/** STAFF는 권한 탭 접근을 제외하면 ADMIN과 동일한 관리 작업을 할 수 있다. */
export function isAdminRole(role: MemberRole): boolean {
  return role === "ADMIN" || role === "STAFF";
}

/** ADMIN 또는 STAFF 권한을 가진 회원만 통과시킨다(관리 페이지 접근). */
export function useRequireAdmin(): Member | null | undefined {
  const { member } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (member === undefined) return;
    if (member === null) {
      router.replace("/login");
      return;
    }
    if (!isAdminRole(member.role)) {
      router.replace("/");
    }
  }, [member, router]);

  if (member === undefined) return undefined;
  if (member !== null && isAdminRole(member.role)) return member;
  return null;
}
