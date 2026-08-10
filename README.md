# 3113 Adventures – Sprint 10.0.2 Hotfix

## Warum
Der komplette GPX-Track wurde bisher zusammen mit allen App-Daten als ein einziges großes JSONB-Feld gespeichert. Bei großen Tracks kann Supabase diesen Datenbank-Write wegen `statement timeout` abbrechen.

## Änderung
- Cloud-Snapshot wird in kleine Pakete zerlegt.
- GPX-Tracks werden in Blöcke zu maximal 4.000 Punkten geteilt.
- Metadaten, Touren, Einstellungen und localStorage werden separat gespeichert.
- Upload zeigt den Fortschritt `Paket X von Y`.
- Download setzt die GPX-Blöcke wieder zum vollständigen Track zusammen.
- Lokale Datenstruktur der App bleibt unverändert.

## Einmalige Supabase-Anpassung
Im Supabase SQL Editor `supabase/setup_10_0_2.sql` ausführen.

Danach:
1. Sprint 10.0.2 installieren.
2. Auf Hauptgerät anmelden.
3. `Cloud speichern`.
4. Auf zweitem Gerät anmelden.
5. `Cloud laden`.

Die alte Tabelle `user_snapshots` kann bestehen bleiben; Sprint 10.0.2 verwendet `user_sync_chunks`.
