# 3113 Adventures – Sprint 10.8.1

## Punkte-setzen Hotfix
- Klick direkt auf den bestehenden Track funktioniert jetzt explizit.
- Ein Track-Klick setzt einen neuen Wegpunkt auf den nächstgelegenen vorhandenen Trackpunkt.
- Klick neben den Track setzt einen freien Wegpunkt.
- Ein Klick auf einen neu gesetzten nummerierten Punkt entfernt ihn wieder.
- Normale Kartenklicks außerhalb des Modus `Punkte setzen` verändern den Track nicht mehr.
- Dadurch bleiben keine versehentlich gesetzten Punkte im Track hängen.
- Nach `Punkte verbinden` werden die temporären Punkte sauber entfernt.

Keine Supabase-SQL-Anpassung erforderlich.
