# 3113 Adventures – Sprint 10.9

## Komoot-Verknüpfung
- Pro Tour kann ein **Komoot-Collection-Link** hinterlegt werden.
- Tourkarte und Dashboard zeigen **„Komoot-Collection öffnen“**.
- Die interne 3113-Karte mit GPX, Etappen und POIs bleibt erhalten.

## Komoot-Etappen einzeln importieren und verbinden
- Neue Funktion unter **Karte / GPX**: „Komoot-Etappe(n) hinzufügen“.
- Eine oder mehrere aus Komoot exportierte GPX-Dateien können importiert werden.
- Jede GPX-Datei wird als **eigene Etappe** angelegt.
- Weitere Dateien können später einzeln ergänzt werden; sie werden an die aktive Tour angehängt.
- Alle importierten Etappen werden zusätzlich zu einem **Gesamttrack der Tour** verbunden und auf der Karte dargestellt.
- Distanz/Höhenmeter pro Etappe werden aus der jeweiligen GPX-Datei berechnet.
- Der Gesamttrack kann weiterhin als GPX exportiert werden.
- Änderungen werden über den bestehenden Local-first-/Supabase-Sync erfasst.

## Hinweis zu Komoot
Komoot stellt keine öffentliche API bereit, über die 3113 Adventures eine Collection automatisch als Kartenlayer auslesen könnte. Deshalb wird die Collection verlinkt; die Streckenübernahme erfolgt zuverlässig über GPX-Dateien.

**Keine Supabase-SQL-Anpassung erforderlich.**
