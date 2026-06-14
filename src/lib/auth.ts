// src/lib/auth.ts — 사용자이름 기반 단순 로그인 + localStorage 세션 보관
// 백엔드(/api/login)에 사용자이름을 보내고, 처음이면 자동 회원가입된다.

// 기존 Chatbot.tsx 와 동일한 규칙: 빌드시 VITE_API_BASE_URL, 없으면 '/api' 프록시.
export const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || '/api'

const STORAGE_KEY = 'polaris_user'

export interface User {
  user_id: string
  display_name: string
}

export function getUser(): User | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

export function setUser(user: User): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

export function clearUser(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export interface LoginResult extends User {
  is_new: boolean
}

// 사용자이름으로 로그인/회원가입. 성공 시 localStorage 에 저장하고 결과를 반환한다.
export async function login(username: string): Promise<LoginResult> {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new Error(detail?.detail || `로그인 실패 (${res.status})`)
  }
  const data = (await res.json()) as LoginResult
  setUser({ user_id: data.user_id, display_name: data.display_name })
  return data
}
