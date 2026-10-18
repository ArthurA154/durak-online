# Durak online

Das russische Kartenspiel **Durak** im Browser – für 2 bis 4 Spieler, Variante *Perevodnoy* (mit Weiterschieben).

### ▶️ Jetzt spielen: **https://arthura154.github.io/durak-online/**

Raum erstellen, Code oder Link an die Freunde schicken, loslegen. Läuft am Handy und am PC, ohne Anmeldung.

## Was drin ist

- **Echtzeit-Multiplayer**: private Räume mit Code oder öffentliche Räume aus der Liste „Offene Spiele“
- **Regeln** mit 36 Karten (6 bis Ass), Trumpf ist die unterste Karte, Weiterschieben, Unentschieden. Einstellbar in der Lobby: Nachlegen „alle“ oder „nur Nachbarn“ und Angriff mit maximal 6 Karten oder unbegrenzt
- **Zug-Timer** und ein 4-Sekunden-Countdown zum Nachlegen nach dem Schlucken
- **Chat** mit Sprechblasen und Schnellsprüchen, dazu Tomaten, Eier, Hausschuhe, Fische und Blumen zum Werfen 🍅
- **Durak-Zähler** als Rangliste. Die Narrenkappe trägt der Durak der letzten Partie
- **Pause**, wenn jemand die Verbindung verliert („Raucherpause 🚬“), mit automatischem Wiederverbinden
- **Acht Hintergründe** von Kneipe über Zugabteil bis Weltraum, Musik und Sounds, Sprachen Deutsch, Englisch und Russisch

## Technik

| Teil | Stack |
|---|---|
| Frontend | React 18, TypeScript, Vite, Framer Motion, Web Animations API, Web Audio (Musik und Sounds werden im Browser erzeugt, ohne Audiodateien) |
| Backend | Node.js 20, TypeScript, Socket.IO – die Spiellogik läuft komplett auf dem Server: Er mischt, teilt aus und prüft jeden Zug, und jeder Spieler sieht nur seine eigenen Karten |
| Gemeinsam | `shared/`: Typen, Regeln und Übersetzungen für Frontend und Backend (npm workspaces) |
| Tests | Vitest |
| Betrieb | Frontend auf GitHub Pages (GitHub Actions), Backend als Docker-Container hinter Caddy |

## Lokal starten

```bash
npm install
npm run dev:backend    # Server auf http://localhost:3002
npm run dev:frontend   # Spiel auf http://localhost:5173
npm test               # Tests
```

Zum Ausprobieren mit zwei Spielern auf einem Rechner: ein normales und ein privates Browserfenster öffnen.

## Entstehung

Eigenentwicklung von [ArthurA154](https://github.com/ArthurA154). Den Feinschliff der finalen Version – Hintergründe, Animationen und die kniffligeren Teile der Spiellogik – habe ich mit [Claude Code](https://claude.com/claude-code) erarbeitet.
