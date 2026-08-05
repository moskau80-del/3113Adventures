# 3113 Adventures – Version 4.0.0 / Sprint 5.1.3

## Doppelte Etappensicherung

- Etappen werden in IndexedDB gespeichert.
- Zusätzlich wird eine unabhängige Sicherung in localStorage angelegt.
- Beim App-Start werden beide Speicher geprüft.
- Fehlen Etappen in IndexedDB, werden sie automatisch aus dem Backup wiederhergestellt.
- Bearbeiten und Löschen aktualisieren beide Speicher.
- Die Erfolgsmeldung nennt die tatsächlich verwendeten Speicher.

## Test

1. Etappen neu erzeugen.
2. Es muss `IndexedDB`, `lokales Backup` oder beides in der Meldung stehen.
3. Seite mit derselben Branch-Deploy-Adresse neu laden.
4. Die Etappen müssen erneut erscheinen.

Wichtig: Immer dieselbe stabile Branch-Adresse verwenden, nicht eine wechselnde Deploy-Preview-Adresse.

Oben rechts muss `v4.0.0 · Sprint 5.1.3` stehen.
