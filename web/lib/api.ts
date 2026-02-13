'use client';

// Routes that have Next.js API fallbacks
const FALLBACK_ROUTES = ['/agent/command', '/agent/autopilot/preview'];

function hasFallback(path: string): boolean {
  return FALLBACK_ROUTES.some((route) => path.startsWith(route));
}

function isLocalDev(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...(init?.headers || {}),
  };

  // In production or if route has fallback, use Next.js API routes directly
  if (!isLocalDev() && hasFallback(path)) {
    const response = await fetch(`/api${path}`, { ...init, headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed: ${response.status}`);
    }
    return (await response.json()) as T;
  }

  // In local dev, try backend server first
  const backendUrl = `${window.location.protocol}//${window.location.hostname}:4000`;

  try {
    const response = await fetch(`${backendUrl}${path}`, { ...init, headers });
    if (response.ok) {
      return (await response.json()) as T;
    }
    throw new Error(`Backend request failed: ${response.status}`);
  } catch (error) {
    // Backend unreachable, try fallback if available
    if (hasFallback(path)) {
      const fallbackResponse = await fetch(`/api${path}`, { ...init, headers });
      if (!fallbackResponse.ok) {
        const text = await fallbackResponse.text();
        throw new Error(text || `Fallback request failed: ${fallbackResponse.status}`);
      }
      return (await fallbackResponse.json()) as T;
    }
    throw error;
  }
}
