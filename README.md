# 3113 Adventures v4 – Sprint 10.9.6

## Neu in Sprint 10.9.6
- Im Etappentrack-Editor gibt es jetzt den Routingmodus **„Frei / weglos“**.
- In diesem Modus darf der Track beliebig verlaufen und muss keinem in OpenStreetMap vorhandenen Weg folgen.
- Drag & Drop auf der Tracklinie bleibt exakt in der manuell gezogenen Form; es erfolgt kein automatisches Zurückrouten auf Wanderwege.
- Mit **„Wander-/Fussweg“** bleibt das bisherige automatische Valhalla-Routing über vorhandene Wege verfügbar.
- Die Option „Nach Drag & Drop automatisch über Wanderwege routen“ wird im freien Modus deaktiviert, damit klar ist, welches Verhalten aktiv ist.
- Auch mit „Punkte setzen“ können im freien Modus wegelose Abschnitte direkt verbunden werden.
- Keine Supabase-/SQL-Änderung erforderlich.


## Neu
- In jeder Etappenkarte werden der festgelegte Start und das festgelegte Ziel zusätzlich deutlich als eigene Angaben angezeigt.
- Im Roadbook erscheint die Route Start → Ziel direkt unter dem Etappentitel.
- Im Roadbook sind die übernommenen Werte ausdrücklich als „Festgelegter Start“ und „Festgelegtes Ziel“ bezeichnet.
- Bevorzugter Start/Ziel bleiben separat sichtbar, damit Planung und tatsächlich übernommene Werte nicht verwechselt werden.
- Keine Supabase-SQL-Änderung erforderlich.
