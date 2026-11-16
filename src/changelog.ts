import raw from '../CHANGELOG.md?raw';

export interface ChangelogSection { title: string; items: string[] }
export interface ChangelogEntry { version: string; date: string; sections: ChangelogSection[] }

/** Zparsuje CHANGELOG.md (## verze – datum, ### sekce, - položky). */
export function parseChangelog(md: string): ChangelogEntry[] {
  const out: ChangelogEntry[] = [];
  let cur: ChangelogEntry | null = null;
  let sec: ChangelogSection | null = null;
  for (const line of md.split('\n')) {
    const v = line.match(/^##\s+\[?([\w.\-]+)\]?\s*[–-]\s*(.+?)\s*$/);
    if (v) { cur = { version: v[1], date: v[2], sections: [] }; out.push(cur); sec = null; continue; }
    const t = line.match(/^###\s+(.+?)\s*$/);
    if (t && cur) { sec = { title: t[1], items: [] }; cur.sections.push(sec); continue; }
    const it = line.match(/^-\s+(.+?)\s*$/);
    if (it && cur) {
      if (!sec) { sec = { title: 'Změny', items: [] }; cur.sections.push(sec); }
      sec.items.push(it[1]);
    } else if (/^\s{2,}\S/.test(line) && sec && sec.items.length) {
      sec.items[sec.items.length - 1] += ' ' + line.trim();
    }
  }
  return out;
}

export const CHANGELOG: ChangelogEntry[] = parseChangelog(raw);
export const APP_VERSION: string = __APP_VERSION__;
