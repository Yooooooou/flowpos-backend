import type { OfflineDraftOrder, User } from "../types";

const AUTH_KEY = "flowpos.auth";
const USER_KEY = "flowpos.user";
const OFFLINE_QUEUE_KEY = "flowpos.offline.queue";
const DEVICE_KEY = "flowpos.device";

export function loadToken() {
  return localStorage.getItem(AUTH_KEY);
}

export function saveToken(token: string) {
  localStorage.setItem(AUTH_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(AUTH_KEY);
}

export function loadUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as User) : null;
}

export function saveUser(user: User) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearUser() {
  localStorage.removeItem(USER_KEY);
}

export function loadOfflineQueue() {
  const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
  return raw ? (JSON.parse(raw) as OfflineDraftOrder[]) : [];
}

export function saveOfflineQueue(queue: OfflineDraftOrder[]) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) {
    return existing;
  }
  const generated = `device-${crypto.randomUUID()}`;
  localStorage.setItem(DEVICE_KEY, generated);
  return generated;
}
