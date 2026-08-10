# 3113 Adventures – Sprint 10.2

## Behoben: Mobile Navigation
- Übersicht ist auf dem Handy direkt in der unteren Navigation erreichbar.
- Packlisten sind auf dem Handy direkt erreichbar.
- Mobile Navigation ist horizontal scrollbar, damit keine Funktion verschwindet.

## Behoben: bidirektionale Synchronisation
Ursachen in 10.1/10.1.1:
1. Gerätespezifische `3113-cloud-*` Werte wurden selbst in den Cloud-Snapshot aufgenommen.
2. Beim Cloud-Laden konnten dadurch Sync-Zustände eines anderen Geräts übernommen werden.
3. Der lokale Fingerprint enthielt `exportedAt`; dadurch änderte er sich bei jeder Prüfung.
4. Änderungen in IndexedDB wurden nicht zuverlässig als lokale Änderungen markiert.

10.2:
- `3113-cloud-*` und Auth-Session bleiben immer lokal pro Gerät.
- stabiler Fingerprint ohne Zeitstempel.
- alle 10 Sekunden werden localStorage UND IndexedDB auf Änderungen geprüft.
- lokale Änderung + unveränderte Cloud -> automatisch hochladen.
- Cloud geändert + lokal unverändert -> automatisch laden.
- beide geändert -> Konflikt, kein automatisches Überschreiben.
- automatisches Laden direkt nach Login ist deaktiviert, wenn Auto-Sync aktiv ist.
- manuelles Cloud speichern/laden bleibt als Notfallfunktion.

Keine neue Supabase-SQL-Datei erforderlich.
