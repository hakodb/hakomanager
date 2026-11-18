import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { isResponseEnvelope, type Request } from '../types';

declare global {
  interface Window {
    __TAURI__?: unknown;
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauri(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

function mockInvoke<T>(_op: string, _args?: unknown): Promise<T> {
  return Promise.reject(
    new Error(
      'HakoManager backend is unavailable. Run the application inside the Tauri desktop shell to execute commands.'
    )
  );
}

export async function invoke<T>(op: string, args?: unknown): Promise<T> {
  if (!isTauri()) {
    return mockInvoke<T>(op, args);
  }

  const requestJson = JSON.stringify({ op, args } satisfies Request);
  const raw = await tauriInvoke<string>('hako_exec', { requestJson });

  const parsed: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!isResponseEnvelope(parsed)) {
    throw new Error('Invalid response envelope received from the backend.');
  }

  if (!parsed.ok) {
    const message = parsed.error?.message ?? 'Unknown backend error.';
    throw new Error(message);
  }

  return parsed.data as T;
}
