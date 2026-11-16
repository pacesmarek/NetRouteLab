# Backlog – NetRoute Lab

Seznam nápadů na další funkce. Postupně je odbavujeme, doplňujeme a přeškrtáváme.

## Jak s tím pracovat

- Každá položka má **ID** (`B-01` …), **prioritu** (🔴 vysoká · 🟡 střední · ⚪ nízká) a **stav**.
- Stavy: `nápad` → `plán` (rozhodnuto, že to uděláme) → `rozpracováno` → `hotovo` (přesun do sekce *Hotovo*).
- Nový nápad: připsat na konec příslušné sekce, další volné ID, stav `nápad`.
- Po dokončení: přesunout do *Hotovo*, doplnit datum a commit/PR. Zamítnuté nápady nemazat, přesunout do *Zamítnuto* s důvodem.
- U položek, kde záleží na tom, jak se to používá ve výuce, je v poznámce **Otázka** – ta se řeší před implementací.

---

## Výuka a obsah

| ID | Priorita | Stav | Nápad | Poznámka |
|----|----------|------|-------|----------|
| B-03 | 🟡 | nápad | **Další zadání a typy úloh** | Scénáře #5 (kamery) a #6 (switch + server) jsou hotové. Zbývá „najdi chybu“ v hotové konfiguraci a zadání vynucující konkrétní porty (simulace by je kontrolovala). **Otázka:** jaké typy úloh se ve výuce zadávají nejčastěji? |
| B-04 | 🟡 | nápad | **Režim pro vyučujícího** | Vypnutí nápovědy a „Vyplnit za mě“ v Průvodci, skrytí Vzorového řešení heslem, hodnocení (kolik polí je správně). |

## Simulace

| ID | Priorita | Stav | Nápad | Poznámka |
|----|----------|------|-------|----------|
| B-10 | 🟡 | nápad | **Rozšířená kalkulačka sítí** | Rozsah použitelných adres, počet hostů, převod masky ↔ prefix, binární zápis. Teď ukazuje jen síť a broadcast. |
| B-13 | ⚪ | nápad | **Firewall pravidla** | Povolit / zakázat port; ukáže rozdíl „router přeloží“ × „router pustí“. |
| B-14 | ⚪ | nápad | **Další zařízení** | Tiskárna a další koncová zařízení. Switch, Wi-Fi AP i Router už jsou hotové (viz Hotovo). |
| B-17 | 🟡 | nápad | **Volné plátno – rozšíření** | WAN routeru jako DHCP klient (adresa od nadřazeného routeru), statické trasy, propojení dvou sítí přes router (komunikace mezi LAN, ne jen do internetu), uložení vlastních „šablon“ sítí. |
| B-15 | 🟡 | nápad | **VLSM úloha** | Rozdělit blok na podsítě podle počtu hostů („50, 20 a 10 stanic“), kontrola překryvů. |
| B-16 | ⚪ | nápad | **ARP / MAC tabulka** | Doplněk k výkladu vrstvy 2. |

## Pohodlí na tabuli

| ID | Priorita | Stav | Nápad | Poznámka |
|----|----------|------|-------|----------|
| B-22 | 🟡 | plán | **Ověřit dotyk na skutečné tabuli** | Pinch-zoom, posun plochy a tažení zařízení prstem jsou hotové, ale zatím ověřené jen v prohlížeči na počítači. Zkusit na dotykové tabuli / tabletu; případně doladit `touch-action`. |

## Technické

| ID | Priorita | Stav | Nápad | Poznámka |
|----|----------|------|-------|----------|
| B-30 | 🟡 | nápad | **UI testy (Playwright)** | Průvodce, přetažení, test PAT. Teď je pokrytá jen logika (31 testů vitest). |
| B-31 | ⚪ | nápad | **CI a preview nasazení** | GitHub Action (typecheck + testy + build); Netlify deploy preview pro pull requesty. |
| B-32 | ⚪ | nápad | **Přístupnost** | Přesun zařízení klávesnicí (šipky), kontrast, popisky pro čtečky. |
| B-33 | ⚪ | nápad | **Úklid** | Smazat `legacy/` po nasazení, srovnat dokumentaci. |

---

## Rozpracováno

_nic_

## Hotovo

| Datum | Co |
|-------|----|
| 2026-11-16 | Vertikální topologie, zařízení jako obrázky, nastavení vyjíždí do strany, zavření kliknutím mimo |
| 2026-11-16 | Přetahování zařízení (myš, dotyk, pero), uložené rozmístění |
| 2026-11-16 | Masky dekadicky jako výchozí, lomený zápis (CIDR) jako pokročilá volba |
| 2026-11-16 | Průvodce se spotlight overlay, dvoustupňová nápověda, kontrola zadaných hodnot |
| 2026-11-16 | Přepis do React + TypeScript (Vite, Tailwind), testy logiky |
| 2026-11-16 | Přidávání PC, kamer a web serverů; PAT na obou routerech; test přístupu z internetu |
| 2026-11-16 | Panely WAN / LAN / PAT pod sebou; tmavý režim (výchozí dle systému); velikost písma včetně „Tabule“ |
| 2026-11-16 | Logo TF ČZU, copyright v patičce, sjednocená fialová pro PAT / kamery / web servery |
| 2026-11-16 | Pevné tlačítko „Otestovat připojení“ v pravém sloupci |
| 2026-11-16 | Sdílení zadání odkazem (s řešením i bez) a export / import souboru JSON; export schématu do PNG (PDF zatím ne) |
| 2026-11-16 | Ukládání stavu v prohlížeči (zařízení, pravidla PAT, hodnoty, rozmístění) |
| 2026-11-16 | Krok zpět / znovu (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y) i tlačítky v hlavičce |
| 2026-11-16 | Traceroute s animací paketu po hopech (TTL) a výpisem hopů v diagnostice |
| 2026-11-16 | Zařízení Switch a Wi-Fi AP; připojení zařízení k Routeru 2 / switchi / AP (Wi-Fi čárkovaně) |
| 2026-11-16 | Přichytávání k mřížce a zarovnávací vodítka při tažení |
| 2026-11-16 | Zoom a posun plochy (tlačítka, Ctrl + kolečko, pinch) – viz B-22 k ověření na tabuli |
| 2026-11-16 | Volitelný zvuk a rychlost animace (Rychle / Normální / Pomalu pro výklad) |
| 2026-11-16 | Seznam úloh s možností spustit libovolné zadání; nové úlohy #5 a #6 |
| 2026-11-16 | Changelog a číslo verze v aplikaci; vysvětlení tlačítka „Kalkulačka sítí“ |
| 2026-11-16 | DHCP server na Routeru 2 a automatické získání adresy u zařízení (verze 1.3.0); úloha #7 |
| 2026-11-16 | Přetahování nových zařízení z panelu přímo na plochu |
| 2026-11-16 | Záložky: více pláten (volných i úloh) vedle sebe, každé s vlastní historií a uložením (verze 1.5.0) |
| 2026-11-16 | Volné plátno: výchozí prázdné plátno (ISP + hraniční router), routery, libovolná topologie, přepojování kabelů tečkami, režimy AP (Access Point / Klient / Bridge), DHCP na routerech i AP, celá obrazovka, štětec a reset plátna, rychlé smazání z karty (verze 1.4.0) |

## Zamítnuto

_nic_
