# 3113 Adventures – Version 4.0.0 / Sprint 5.2.1

## Kritische Fehlerkorrektur

- IndexedDB-Version wurde von 4 auf 10 erhöht.
- Dadurch wird kein unzulässiges Datenbank-Downgrade mehr versucht.
- Bereits gespeicherte Tour- und GPX-Daten bleiben zugänglich.
- Die App initialisiert auch dann weiter, wenn einzelne Einstellungen fehlen.
- Der GPX-Code greift nicht mehr auf das entfernte Vorschau-Element zu.
- GPX-Dateien können wieder importiert werden.

## Kontrolle

- Oben rechts muss `v4.0.0 · Sprint 5.2.1` stehen.
- Unter Touren muss `Nord-Süd-Trail 2027` erscheinen.
- Unter Karte muss `GPX-Datei auswählen` funktionieren.
