import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

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
