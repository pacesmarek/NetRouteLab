import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';

/** useState, který si hodnotu pamatuje v localStorage (bezpečně – úložiště nemusí být dostupné). */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignorováno */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

/** Sleduje šířku prvku. */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/** Callback-ref, který průběžně hlásí výšku prvku v px. */
export function useMeasuredHeight(): [(el: HTMLElement | null) => void, number] {
  const [h, setH] = useState(0);
  const roRef = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) { setH(0); return; }
    const ro = new ResizeObserver(() => setH(el.offsetHeight));
    ro.observe(el);
    roRef.current = ro;
    setH(el.offsetHeight);
  }, []);
  return [ref, h];
}

/** Šířka okna v rem (závisí na zvolené velikosti písma). */
export function useViewportRem(rootPx: number): number {
  const [w, setW] = useState(() => window.innerWidth / rootPx);
  useEffect(() => {
    const update = () => setW(window.innerWidth / rootPx);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [rootPx]);
  return w;
}

/**
 * Stav s historií (zpět / znovu). Opakované úpravy se stejným `key` v krátkém čase se slučují
 * do jednoho kroku (psaní do pole, tažení zařízení).
 */
export function useHistory<T>(initial: T | (() => T), limit = 100) {
  const [state, setState] = useState<{ past: T[]; present: T; future: T[] }>(() => ({
    past: [],
    present: typeof initial === 'function' ? (initial as () => T)() : initial,
    future: [],
  }));
  const meta = useRef({ key: '', t: 0 });

  const set = useCallback((updater: (d: T) => T, key?: string) => {
    const now = Date.now();
    const coalesce = !!key && meta.current.key === key && now - meta.current.t < 900;
    meta.current = { key: key ?? '', t: now };
    setState((s) => {
      const next = updater(s.present);
      if (next === s.present) return s;
      if (coalesce) return { ...s, present: next };
      return { past: [...s.past.slice(-(limit - 1)), s.present], present: next, future: [] };
    });
  }, [limit]);

  const undo = useCallback(() => {
    meta.current = { key: '', t: 0 };
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);
  const redo = useCallback(() => {
    meta.current = { key: '', t: 0 };
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);
  /** Nahradí stav a smaže historii (načtení z odkazu / souboru). */
  const reset = useCallback((doc: T) => {
    meta.current = { key: '', t: 0 };
    setState({ past: [], present: doc, future: [] });
  }, []);

  return { doc: state.present, set, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}


// ----------------------------------------------------------------------------
// Záložky: každá má vlastní dokument a vlastní historii (zpět / znovu)

export interface TabSave<T> { id: string; name: string; custom: boolean; doc: T }
interface TabState<T> extends TabSave<T> { past: T[]; future: T[] }

let tabSeq = 0;
const newTabId = () => `t${Date.now().toString(36)}${(tabSeq++).toString(36)}`;

/** Jako useHistory, ale s více záložkami. `set` / `undo` / `redo` pracují s aktivní záložkou. */
export function useTabs<T>(initial: () => { tabs: TabSave<T>[]; active: string }, limit = 100) {
  const [state, setState] = useState<{ tabs: TabState<T>[]; active: string }>(() => {
    const i = initial();
    const tabs = i.tabs.map((t) => ({ ...t, past: [], future: [] }));
    return { tabs, active: tabs.some((t) => t.id === i.active) ? i.active : tabs[0].id };
  });
  const meta = useRef({ key: '', t: 0 });

  const set = useCallback((updater: (d: T) => T, key?: string) => {
    const now = Date.now();
    setState((s) => {
      const k = key ? `${s.active}:${key}` : '';
      const coalesce = !!k && meta.current.key === k && now - meta.current.t < 900;
      meta.current = { key: k, t: now };
      const cur = s.tabs.find((t) => t.id === s.active)!;
      const next = updater(cur.doc);
      if (next === cur.doc) return s;
      const upd: TabState<T> = coalesce ? { ...cur, doc: next } : { ...cur, doc: next, past: [...cur.past.slice(-(limit - 1)), cur.doc], future: [] };
      return { ...s, tabs: s.tabs.map((t) => (t.id === cur.id ? upd : t)) };
    });
  }, [limit]);

  const patchActive = (fn: (t: TabState<T>) => TabState<T>) => setState((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id === s.active ? fn(t) : t)) }));
  const undo = useCallback(() => {
    meta.current = { key: '', t: 0 };
    patchActive((t) => (t.past.length ? { ...t, doc: t.past[t.past.length - 1], past: t.past.slice(0, -1), future: [t.doc, ...t.future] } : t));
  }, []);
  const redo = useCallback(() => {
    meta.current = { key: '', t: 0 };
    patchActive((t) => (t.future.length ? { ...t, doc: t.future[0], past: [...t.past, t.doc], future: t.future.slice(1) } : t));
  }, []);
  /** Nahradí dokument aktivní záložky a smaže její historii. */
  const reset = useCallback((doc: T) => {
    meta.current = { key: '', t: 0 };
    patchActive((t) => ({ ...t, doc, past: [], future: [] }));
  }, []);
  const addTab = useCallback((doc: T, name = '') => {
    meta.current = { key: '', t: 0 };
    const id = newTabId();
    setState((s) => ({ tabs: [...s.tabs, { id, name, custom: false, doc, past: [], future: [] }], active: id }));
    return id;
  }, []);
  const selectTab = useCallback((id: string) => { meta.current = { key: '', t: 0 }; setState((s) => (s.tabs.some((t) => t.id === id) ? { ...s, active: id } : s)); }, []);
  const renameTab = useCallback((id: string, name: string) => setState((s) => ({
    ...s, tabs: s.tabs.map((t) => (t.id === id ? { ...t, name: name.trim(), custom: !!name.trim() } : t)),
  })), []);
  /** Zavře záložku; poslední zavřená se nahradí novou (`fresh`). */
  const closeTab = useCallback((id: string, fresh: () => T) => {
    meta.current = { key: '', t: 0 };
    setState((s) => {
      const i = s.tabs.findIndex((t) => t.id === id);
      if (i < 0) return s;
      const rest = s.tabs.filter((t) => t.id !== id);
      if (!rest.length) { const t = { id: newTabId(), name: '', custom: false, doc: fresh(), past: [], future: [] }; return { tabs: [t], active: t.id }; }
      return { tabs: rest, active: s.active === id ? rest[Math.max(0, i - 1)].id : s.active };
    });
  }, []);

  const cur = state.tabs.find((t) => t.id === state.active)!;
  const saves: TabSave<T>[] = useMemo(() => state.tabs.map(({ id, name, custom, doc }) => ({ id, name, custom, doc })), [state.tabs]);
  return { doc: cur.doc, set, undo, redo, reset, canUndo: cur.past.length > 0, canRedo: cur.future.length > 0, tabs: saves, active: state.active, addTab, selectTab, renameTab, closeTab };
}
