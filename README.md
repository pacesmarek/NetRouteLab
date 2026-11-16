# NetRoute Lab

Interaktivní výukový simulátor směrování, podsítí, Double NAT a PAT (React + TypeScript + Vite + Tailwind).
Laboratoř výpočetních aplikací – Technická fakulta ČZU v Praze.

## Funkce

- topologie ISP → Router 1 → Router 2 → PC, zařízení se dají přetahovat, nastavení vyjíždí do strany
- do plochy lze přidat další PC, kamery (RTSP 554) a web servery (HTTP 80)
- PAT (přesměrování portů) na obou routerech + test přístupu z internetu přes dvojitý NAT
- Průvodce (spotlight) krok za krokem včetně zařízení a PAT
- světlý / tmavý / systémový režim, velikost písma (Normální / Větší / Tabule), lomený zápis masek jako pokročilá volba
- starší prototypy (jediný HTML soubor) jsou ve složce `legacy/`

## Vývoj

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # testy síťové logiky (vitest)
npm run build      # typecheck + produkční build do dist/
```

## Struktura

- `src/lib/net.ts` – IPv4 matematika (adresa, maska, síť, broadcast)
- `src/lib/simulate.ts` – čistá simulace: ping z PC (`simulate`) a přístup z internetu přes PAT (`simulateInbound`)
- `src/lib/plan.ts` – správné řešení pro aktuální zadání včetně zařízení a pravidel PAT (používá Průvodce a „Vzorové řešení“)
- `src/components/` – UI (karty zařízení s drag & drop, panely nastavení, Průvodce, diagnostika)

## Nasazení na Netlify

`netlify.toml` je připravený (build `npm run build`, publish `dist`).

- **Přes Git:** nahrajte repozitář na GitHub → Netlify → *Add new site → Import from Git*.
- **Přes CLI:** `npx netlify-cli login`, pak `npx netlify-cli init` a `npx netlify-cli deploy --prod`.
