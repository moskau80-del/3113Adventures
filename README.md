# 3113 Adventures v4 – Sprint 10.9.9

## Neu in Sprint 10.9.9
- **Trackabschnitte wirklich verkürzen:** Beim Greifen der Tracklinie wird nicht mehr ein grosser Teil der Route wie ein Gummiband verschoben. Stattdessen werden vor und nach der Griffstelle zwei lokale Anker gesetzt und nur der Abschnitt dazwischen ersetzt.
- **Wander-/Fussweg:** Nur der bearbeitete Abschnitt wird über `Anker → gezogener Punkt → Anker` neu geroutet. Der restliche Track bleibt exakt erhalten.
- **Frei / weglos:** Der bearbeitete Abschnitt wird direkt über den gezogenen Punkt verbunden. Damit lassen sich Schleifen abschneiden und echte Abkürzungen erzeugen.
- Start und Ziel bleiben beim Bearbeiten eines Zwischenabschnitts unverändert; die in 10.9.8 eingeführten verschiebbaren Start-/Zielmarker bleiben erhalten.
- **Neue To-Do-Liste pro Tour:** Jede Tour hat ihre eigene Aufgabenliste mit Aufgabe, Termin und Priorität. Aufgaben können erledigt, wieder geöffnet und gelöscht werden. Filter „Offen“ / „Alle“.
- Die To-Do-Daten werden lokal pro Tour gespeichert und über den bestehenden Cloud-Snapshot mit synchronisiert.
- Keine Supabase-SQL-Änderung erforderlich.

## Neu in Sprint 10.9.7

- Im Etappentrack-Editor bleiben **Etappen-Start und Etappen-Ziel fest verankert**.
- Beim Drag & Drop direkt an der Tracklinie wird nur der **Weg zwischen Start und Ziel** verschoben.
- Auch im Modus **Frei / weglos** kann das festgelegte Ziel nicht mehr versehentlich mitgezogen werden.
- Start- und Zielmarker sind im Track-Editor nicht mehr draggable; Änderungen von Start/Ziel erfolgen weiterhin bewusst über die Etappenfunktion „Start / Ziel festlegen“.
- Kontrollpunkte können weiterhin verschoben werden; ihre weiche Verschiebung beeinflusst Start und Ziel nicht.
- Fussweg-Routing behält dieselben Start-/Zielanker bei.

## Supabase

Keine SQL-Änderung erforderlich.
