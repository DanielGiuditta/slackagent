'use client';

function resolveBackendUrl() {
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (env) return env;
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return 'http://localhost:4000';
}

// Routes that have Next.js API fallbacks
const FALLBACK_ROUTES = ['/agent/command', '/agent/autopilot/preview'];

function hasFallback(path: string): boolean {
  return FALLBACK_ROUTES.some((route) => path.startsWith(route));
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const backendUrl = resolveBackendUrl();

  // Try backend first
  try {
    const response = await fetch(`${backendUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    if (response.ok) {
      return (await response.json()) as T;
    }
    // If backend returns error but is reachable, throw
    if (response.status !== 0) {
      const text = await response.text();
      throw new Error(text || `Request failed: ${response.status}`);
    }
  } catch (error) {
    // Network error - backend unreachable, try fallback
    if (hasFallback(path)) {
      const fallbackResponse = await fetch(`/api${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers || {}),
        },
      });
      if (!fallbackResponse.ok) {
        const text = await fallbackResponse.text();
        throw new Error(text || `Fallback request failed: ${fallbackResponse.status}`);
      }
      return (await fallbackResponse.json()) as T;
    }
    throw error;
  }

  throw new Error('Request failed');
}
