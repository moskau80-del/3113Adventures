# 3113 Adventures – Version 4.0.0 / Sprint 10.0

## Cloud / mehrere Geräte
Sprint 10.0 ergänzt einen vollständigen Cloud-Snapshot über Supabase.

### Einrichtung
1. Ein Supabase-Projekt erstellen.
2. `supabase/setup.sql` im Supabase SQL Editor ausführen.
3. In der App unter `Einstellungen -> Cloud & mehrere Geräte` die Project URL und den Publishable/anon Browser-Key eintragen.
4. Konto mit E-Mail/Passwort erstellen bzw. anmelden.
5. Auf dem ersten Gerät `Cloud speichern`.
6. Auf einem weiteren Gerät mit demselben Konto anmelden und `Cloud laden`.

### Synchronisiert werden
- alle Touren
- alle GPX-Tracks
- IndexedDB-Einstellungen
- alle Etappen
- Orte und bevorzugte Orte
- Mein-Transa-Artikelliste
- beide Packlisten
- Personennamen
- Schuhzuordnung / Schuhkilometer
- weitere 3113ADVENTURE-localStorage-Daten

### Sicherheit
Die Cloud-Tabelle verwendet Row Level Security. Jeder angemeldete Benutzer kann nur den Datensatz seiner eigenen User-ID lesen oder ändern.

### Offline
Die bestehende lokale Speicherung bleibt erhalten. Die App funktioniert weiterhin offline; Cloud ist eine zusätzliche Synchronisations-/Backup-Ebene.

### Konfliktmodell Sprint 10.0
Sprint 10.0 verwendet bewusst einen vollständigen Snapshot:
- `Cloud speichern` = lokaler Stand wird zum Cloud-Stand.
- `Cloud laden` = Cloud-Stand ersetzt die lokalen 3113ADVENTURE-Daten.
Damit gibt es keine stillen Merge-Konflikte.

## Kontrolle
Oben muss `v4.0.0 · Sprint 10.0` stehen.
