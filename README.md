# 3113 Adventures v4 – Sprint 10.9.8

## Neu in Sprint 10.9.8
- Start- und Zielmarker im Etappentrack-Editor sind jetzt gezielt per Drag & Drop verschiebbar.
- Beim Ziehen der Tracklinie bleiben Start und Ziel weiterhin fix; nur ein direkt gegriffener Start-/Zielmarker verändert den Endpunkt.
- Wander-/Fussweg-Modus routet nach dem Verschieben zum neuen Endpunkt; Frei/weglos behält die freie Geometrie.
- Ein manuell verschobener Endpunkt wird als „Manueller Start“ bzw. „Manuelles Ziel“ gekennzeichnet.
- Anschluss zur vorherigen/nächsten Wanderetappe wird beim Speichern mitgeführt.
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
