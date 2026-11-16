# NetRoute Lab

Interaktivní výukový simulátor směrování, podsítí a Double NAT (React + TypeScript + Vite + Tailwind).

## Vývoj

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testy síťové logiky (vitest)
npm run build      # typecheck + produkční build do dist/
```

## Struktura

- `src/lib/net.ts` – IPv4 matematika (adresa, maska, síť, broadcast)
- `src/lib/simulate.ts` – čistá simulace průchodu paketu a validace konfigurace
- `src/lib/plan.ts` – správné řešení pro aktuální zadání (používá Průvodce)
- `src/components/` – UI (karty zařízení s drag & drop, panely nastavení, Průvodce, diagnostika)

## Nasazení na Netlify

`netlify.toml` je připravený (build `npm run build`, publish `dist`).

- **Přes Git:** nahrajte repozitář na GitHub → Netlify → *Add new site → Import from Git*.
- **Přes CLI:** `npx netlify-cli login`, pak `npx netlify-cli init` a `npx netlify-cli deploy --prod`.
