# 3113 Adventures – Sprint 10.2.1 Hotfix

## GPX
- GPX-Import wird nach `saveTrack()` direkt aus IndexedDB verifiziert.
- Karte wird nach dem Import neu gerendert.
- Status zeigt Dateiname, Anzahl Trackpunkte und Distanz.
- dieselbe GPX-Datei kann erneut gewählt werden.
- GPX-Löschen und Trackbearbeitung werden als lokale IndexedDB-Änderung markiert.

## Synchronisation
GPX-Tracks liegen in IndexedDB. Diese Änderungen werden jetzt sofort als lokale Änderung markiert,
damit ein älterer Cloud-Stand den gerade importierten Track nicht überschreibt.

Keine Supabase-SQL-Anpassung erforderlich.
