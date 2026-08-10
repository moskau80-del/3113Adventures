# 3113 Adventures – Sprint 7.5.1 Hotfix

## Behoben
- JavaScript-Startfehler aus Sprint 7.5 behoben.
- Ursache waren doppelte Imports der Schuhplanungsfunktionen in `app.js`.
- Dadurch wurde das komplette Hauptskript nicht geladen: Register, aktive Tour und Etappen reagierten nicht.
- Track-Editor aus 7.5 bleibt enthalten.
- Bestehende Tour- und Etappendaten werden nicht gelöscht.

## Kontrolle
Oben rechts muss `v4.0.0 · Sprint 7.5.1` stehen.
