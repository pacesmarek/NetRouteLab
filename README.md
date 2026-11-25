# NetRoute Lab

Interaktivní výukový simulátor směrování, podsítí, Double NAT a PAT (React + TypeScript + Vite + Tailwind).
Laboratoř výpočetních aplikací – Technická fakulta ČZU v Praze.

## Funkce

- **volné plátno** (výchozí): ISP + hraniční router, další routery, switche, AP (Access Point / Klient / Bridge), PC, kamery a servery si zapojíte sami; kabely se přetahují za tečky nahoře a dole na kartách
- úlohy (např. ISP → Router 1 → Router 2 → PC) se zapínají ručně v „Úlohách"; zařízení se dají přetahovat, nastavení vyjíždí do strany
- DHCP na routerech i AP, PAT přes libovolný počet routerů, celá obrazovka, automatické uspořádání schématu
- do plochy lze přidat další PC, kamery, web servery, switche a Wi-Fi AP
- seznam úloh (včetně úloh s kamerami), sdílení odkazem, export / import, ukládání stavu, krok zpět
- traceroute s animací paketu, zoom a posun plochy, přichytávání k mřížce
- PAT (přesměrování portů) na obou routerech + test přístupu z internetu přes dvojitý NAT
- Průvodce (spotlight) krok za krokem včetně zařízení a PAT
- světlý / tmavý / systémový režim, velikost písma (Normální / Větší / Tabule), lomený zápis masek jako pokročilá volba
- starší prototypy (jediný HTML soubor) jsou ve složce `legacy/`

- backlog nápadů a plán dalších funkcí: [BACKLOG.md](BACKLOG.md), přehled verzí: [CHANGELOG.md](CHANGELOG.md) (zobrazuje se i v aplikaci)

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
