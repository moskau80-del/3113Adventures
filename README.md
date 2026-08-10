# 3113 Adventures – Version 4.0.0 / Sprint 9.12

## Stabilisierung & Gesamttest
In diesem Sprint wurden bewusst keine neuen Funktionen ergänzt.

### Absicherungen
- Start der App modularisiert: Ein Fehler in einem Bereich kann nicht mehr Touren, Navigation und alle anderen Bereiche gleichzeitig ausblenden.
- Etappenanzeige ist gegen Fehler in Dashboard, Packlisten, Transa, Schuhe, Orte, Roadbook und Seitenleiste isoliert.
- `Mein Transa`, Etappen und Orte prüfen, ob ihre Zielbereiche im DOM vorhanden sind.
- Cache-, Refresh- und Service-Worker-Versionen auf Sprint 9.12 vereinheitlicht.
- bestehende Daten in localStorage/IndexedDB werden nicht migriert oder gelöscht.

### Statisch geprüft
- app.js: OK
- database.js: OK
- gpx.js: OK
- stages.js: OK
- places.js: OK
- gear.js: OK

### Prüfschwerpunkte
- Touren laden/aktivieren
- GPX vorhanden
- Etappen laden/löschen/neu erzeugen
- Ruhetage
- Orte/Versorgung/Schuhversorgung
- Mein Transa
- zwei Personen-Packlisten und Bestand
- Schuhe
- Roadbook
- Druck
- Desktop-/Mobile-Navigation

## Kontrolle
Oben muss `v4.0.0 · Sprint 9.12` stehen.

## Nächster Schritt
Sprint 10.0: Cloud-Synchronisation / mehrere Geräte / Release.
