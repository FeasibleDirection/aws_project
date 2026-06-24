// Typed fetch client. Imports TYPES ONLY from the shared Zod SSOT (erased at
// build time), so the frontend speaks the exact same contract as the backend.
import type {
  Order,
  CreateOrderInput,
  UpdateOrderInput,
  Page,
  ApiResponse,
} from "@app/shared";

export function getApiBase(): string {
  const stored = localStorage.getItem("apiBase");
  const injected = (globalThis as { API_BASE?: string }).API_BASE;
  return (stored || injected || "http://localhost:3000").replace(/\/+$/, "");
}

export function setApiBase(value: string): void {
  localStorage.setItem("apiBase", value.replace(/\/+$/, ""));
}

export function getToken(): string {
  return localStorage.getItem("jwt") ?? "";
}

export function setToken(value: string): void {
  localStorage.setItem("jwt", value.trim());
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { authorization: `Bearer ${t}` } : {};
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(getApiBase() + path, {
    headers: { "content-type": "application/json", ...authHeaders() },
    ...init,
  });
  const text = await res.text();
  return (text ? JSON.parse(text) : { ok: true, data: null }) as T;
}

export const listOrders = (limit = 20, cursor?: string) =>
  req<ApiResponse<Page<Order>>>(
    `/orders?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
  );

export const getOrder = (id: string) =>
  req<ApiResponse<Order>>(`/orders/${encodeURIComponent(id)}`);

export const createOrder = (input: CreateOrderInput) =>
  req<ApiResponse<Order>>(`/orders`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const updateOrder = (id: string, input: UpdateOrderInput) =>
  req<ApiResponse<Order>>(`/orders/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

export async function deleteOrder(id: string): Promise<{ status: number }> {
  const res = await fetch(`${getApiBase()}/orders/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return { status: res.status };
}
