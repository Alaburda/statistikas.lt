import type { Variable } from "./types";
import type { VariableType } from "./types";

export interface SavedVariable {
  key: string;
  label: string;
  type: VariableType;
  valueLabels?: Record<string, string>;
  unit?: string;
}

export interface ShareState {
  themeId: string;
  datasetName?: string;
  datasetDesc?: string;
  variables: SavedVariable[];
  chunks: { testId: string; picks: Record<string, string> }[];
}

function toBase64url(state: ShareState): string {
  const json = JSON.stringify(state);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(encoded: string): ShareState | null {
  try {
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function readShareFromUrl(): ShareState | null {
  const match = window.location.hash.match(/[#&]state=([^&]*)/);
  return match ? fromBase64url(match[1]) : null;
}

export function buildShareUrl(state: ShareState): string {
  const url = new URL(window.location.href);
  url.hash = `state=${toBase64url(state)}`;
  return url.toString();
}

export function applyShareToVariables(
  parsed: Variable[],
  saved: SavedVariable[]
): Variable[] {
  const byKey = new Map(saved.map((v) => [v.key, v]));
  return parsed.map((v) => {
    const s = byKey.get(v.key);
    return s ? { ...v, label: s.label, type: s.type, valueLabels: s.valueLabels, unit: s.unit } : v;
  });
}
