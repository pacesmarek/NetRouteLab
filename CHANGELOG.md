# Changelog

Přehled verzí a změn. Zobrazuje se i v aplikaci (odkaz „Co je nového“ v patičce).
Formát: `## verze – datum`, sekce `### Přidáno / Změněno / Opraveno`, položky jako odrážky.

## 1.2.0 – 2026-11-16

### Přidáno
- Sdílení zadání odkazem (s vyplněným řešením nebo bez) a export / import souboru JSON
- Export schématu do obrázku (PNG)
- Ukládání stavu v prohlížeči: zařízení, pravidla PAT, hodnoty i rozmístění zůstanou po obnovení stránky
- Krok zpět / znovu (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y) i tlačítky v hlavičce
- Seznam úloh: otevření všech zadání a spuštění libovolného; dvě nové úlohy (kamerový systém, server a kamera za switchem)
- Traceroute z klientského PC s animací paketu po hopech (TTL 1, 2, 3 …)
- Nová zařízení: Switch a Wi-Fi AP; zařízení lze připojit k Routeru 2, switchi nebo AP (Wi-Fi čárkovaně)
- Přichytávání k mřížce a zarovnávací vodítka při přetahování zařízení (vypnutelné v Nastavení)
- Zoom a posun plochy: tlačítka + / − / Přizpůsobit, Ctrl + kolečko, pinch dvěma prsty
- Volitelný zvuk (úspěch, chyba, hopy traceroute) a nastavení rychlosti animace paketu (Rychle / Normální / Pomalu pro výklad)
- Vysvětlení tlačítka „Kalkulačka sítí“ přímo v aplikaci (co se při zapnutí a vypnutí změní)
- Odkaz na changelog a číslo verze v aplikaci
- Přetahování nových zařízení z panelu „Přidat do plochy“ přímo na plochu (myš i dotyk); puštění na switch nebo AP zařízení rovnou připojí

### Změněno
- Hlavička je v jedné řadě: název aplikace přešel do patičky a popisky vedlejších tlačítek se na užších obrazovkách zobrazí jen jako ikony s nápovědou
- Políčka masky a pravidel PAT už nemají šedý vzorový text, který vypadal jako vyplněná hodnota

## 1.1.0 – 2026-11-16

### Přidáno
- Přidávání PC, kamer (RTSP 554) a web serverů do plochy
- PAT (přesměrování portů) na obou routerech a test přístupu z internetu přes dvojitý NAT
- Průvodce rozšířen o kroky pro zařízení a PAT
- Tmavý režim (výchozí podle systému), logo TF ČZU a copyright v patičce
- Tlačítko „Otestovat připojení“ v pevném pravém sloupci, dlaždice „Přidat do plochy“
- Veřejné porty kamer 8081, 8082, … a web serveru 8080 ve vzorovém řešení

### Změněno
- Panely routerů mají WAN, LAN a PAT pod sebou (chronologie shora dolů)
- Sjednocená fialová pro PAT, kamery a web servery; červená jen pro chyby

## 1.0.0 – 2026-11-16

### Přidáno
- Přepis do React + TypeScript (Vite, Tailwind) s testy logiky
- Vertikální topologie, zařízení jako obrázky, nastavení vyjíždí do strany, zavření kliknutím mimo
- Přetahování zařízení (myš, dotyk, pero) s uloženým rozmístěním
- Průvodce se spotlight overlay a dvoustupňovou nápovědou
- Masky standardně dekadicky, lomený zápis (CIDR) jako pokročilá volba
- Velikost písma včetně režimu „Tabule“
