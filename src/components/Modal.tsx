import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

/** Jednoduché modální okno: Esc a klik mimo zavře. */
export default function Modal({ title, icon, onClose, children, wide = false }: { title: string; icon?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-[2px]" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`bg-surface border border-line rounded-2xl shadow-2xl w-full ${wide ? 'max-w-4xl' : 'max-w-2xl'} max-h-[88vh] flex flex-col`}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line">
          <h2 className="text-xl font-bold text-ink flex items-center gap-2">{icon}{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-ink-3 hover:bg-surface-3 hover:text-ink transition" aria-label="Zavřít" title="Zavřít (Esc)"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
