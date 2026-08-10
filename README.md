# 3113 Adventures – Sprint 10.3

## Synchronisation grundlegend stabilisiert

### Ursache der bisherigen Probleme
Sprint 10.0.x–10.2.x speicherte Cloud-Chunks direkt in den aktiven Datenbestand.
Während ein Gerät die einzelnen Pakete nacheinander hochlud, konnte ein anderes
Gerät den Cloud-Stand bereits lesen. Damit war ein teilweise aktualisierter Stand
möglich.

### Neues Revisionsmodell
- Jeder Upload erhält eine eindeutige Revision.
- Sämtliche Pakete dieser Revision werden vollständig hochgeladen.
- Erst danach wird die Zeile `current` auf die neue Revision gesetzt.
- Andere Geräte lesen ausschließlich die Revision, auf die `current` zeigt.
- Ein Gerät sieht damit immer einen vollständigen Datenstand.

### Bidirektional
- lokales Gerät geändert, Cloud unverändert -> Upload
- Cloud geändert, lokales Gerät unverändert -> Download
- beide unabhängig geändert -> Konfliktmeldung, kein Überschreiben

### Verbesserungen
- Polling alle 5 Sekunden.
- Synchronisation auch beim Zurückkehren zur App / Tab-Fokus.
- Cloud-Vergleich verwendet Revisions-ID statt nur Zeitstempel.
- GPX-Änderungen aus Sprint 10.2.1 bleiben explizit als lokale Änderungen markiert.
- gerätespezifische Cloud-/Auth-Werte werden weiterhin nie synchronisiert.

## Supabase
Keine neue SQL-Datei notwendig. `user_sync_chunks` wird weiterverwendet.
Alte Chunks können bestehen bleiben.
