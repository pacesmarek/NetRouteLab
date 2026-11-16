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
    const ro = new ResizeObserver(() => setH(el.getBoundingClientRect().height));
    ro.observe(el);
    roRef.current = ro;
    setH(el.getBoundingClientRect().height);
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
