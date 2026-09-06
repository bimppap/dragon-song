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
  const [connectionError, setConnectionError] = useState(false);

  const refresh = useCallback(async () => {
    setConnectionError(false);
    if (!getToken()) {
      setMember(null);
      return;
    }
    setMember(undefined);
    try {
      setMember(await fetchMe());
    } catch (error) {
      // API 계층에서 세션 만료가 확정된 경우에만 토큰이 제거된다.
      // 네트워크/서버 장애라면 로그인 정보는 유지하고 재시도 화면을 보여 준다.
      if (!getToken()) {
        setMember(null);
      } else {
        setConnectionError(true);
      }
      throw error;
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
          if (!getToken()) {
            setMember(null);
          } else {
            setConnectionError(true);
          }
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
      setConnectionError(false);
      setMember(null);
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
  }, []);

  async function login(data: LoginRequest) {
    const res = await apiLogin(data);
    setToken(res.access_token);
    setRefreshToken(res.refresh_token);
    setConnectionError(false);
    setMember(res.member);
    return res.member;
  }

  async function signup(data: SignupRequest) {
    return apiSignup(data);
  }

  function logout() {
    const refreshToken = getRefreshToken();
    clearToken();
    setConnectionError(false);
    setMember(null);
    if (refreshToken) {
      // 서버 쪽 refresh token도 무효화한다. 실패해도 로컬 로그아웃은 이미 끝난 상태라 무시한다.
      logoutRequest(refreshToken).catch(() => {});
    }
  }

  return (
    <AuthContext.Provider value={{ member, login, signup, logout, refresh }}>
      {member === undefined ? (
        <main className="mx-auto flex min-h-screen w-full max-w-lg items-center justify-center px-4 py-10 text-center">
          <section className="pixel-frame w-full bg-surface/90 px-6 py-8">
            {connectionError ? (
              <>
                <h1 className="text-lg font-semibold text-ivory">서버에 연결하지 못했습니다</h1>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  일시적인 서버 지연일 수 있습니다. 로그인 정보는 그대로 유지되고 있어요.
                </p>
                <button
                  type="button"
                  className="mt-5 rounded-md border border-gold/70 bg-gold/10 px-4 py-2 text-sm font-semibold text-gold transition-colors hover:bg-gold/20"
                  onClick={() => { refresh().catch(() => {}); }}
                >
                  다시 연결
                </button>
              </>
            ) : (
              <>
                <div className="mx-auto size-7 animate-spin rounded-full border-2 border-gold/30 border-t-gold" aria-hidden />
                <p className="mt-4 text-sm font-semibold text-ivory">로그인 상태를 확인하고 있습니다</p>
                <p className="mt-2 text-xs text-muted">서버가 준비되는 데 잠시 걸릴 수 있어요.</p>
              </>
            )}
          </section>
        </main>
      ) : children}
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
