import { useEffect, useState } from "react";

// Every input lives in the URL hash, so a calculation is a link: it can go to a
// supervisor or into a protocol and open with the same numbers. Nothing is stored.

export type Tab = "apklausa" | "grupes" | "be";
const TABS: Tab[] = ["apklausa", "grupes", "be"];

export function readHash(): { tab: Tab; params: URLSearchParams } {
  const [head, ...rest] = window.location.hash.replace(/^#/, "").split("&");
  return {
    tab: TABS.includes(head as Tab) ? (head as Tab) : "apklausa",
    params: new URLSearchParams(rest.join("&")),
  };
}

/** Form state of one tab: raw strings, so "5," stays on screen while it is being typed. */
export function useForm<T extends Record<string, string>>(tab: Tab, active: boolean, defaults: T) {
  const [form, setForm] = useState<T>(() => {
    const { tab: current, params } = readHash();
    const out = { ...defaults };
    if (current === tab) {
      for (const key of Object.keys(defaults) as (keyof T & string)[]) {
        const value = params.get(key);
        if (value !== null) out[key] = value as T[keyof T & string];
      }
    }
    return out;
  });

  useEffect(() => {
    if (!active) return;
    const params = new URLSearchParams();
    for (const key of Object.keys(defaults)) if (form[key] !== defaults[key]) params.set(key, form[key]);
    const tail = params.toString();
    window.history.replaceState(null, "", `#${tab}${tail ? `&${tail}` : ""}`);
  }, [active, form, tab, defaults]);

  const set = (patch: Partial<T>) => setForm((prev) => ({ ...prev, ...patch }));
  return [form, set] as const;
}
