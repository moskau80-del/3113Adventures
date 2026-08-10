# 3113 Adventures – Version 4.0.0 / Sprint 8.6

## Alte PackLager-Daten direkt übernehmen
- kein Export aus der alten App erforderlich
- neue Schaltfläche `Alte PackLager-Daten übernehmen`
- liest direkt den alten Browser-Speicher `packlagerDataV1`
- übernimmt:
  - Artikelname
  - Kategorie
  - Gewicht
  - Bestand/Menge
  - Lagerort
  - Hersteller/Marke
  - Preis
  - Notizen
- bestehende neue Artikel bleiben erhalten

## Artikeldarstellung
- wieder kompakter und tabellarischer wie in der alten PackLager-App
- Spalten für Artikel, Kategorie, Gewicht, Bestand, Lagerort und Aktionen
- Drag & Drop sowie Person-1/Person-2-Zuordnung bleiben erhalten

## Wichtig
Direkte Übernahme aus `localStorage` funktioniert nur, wenn alte PackLager-App und 3113 Adventures unter derselben Origin laufen (gleiche Domain + Protokoll + Port). Andernfalls kann ein Browser aus Sicherheitsgründen nicht auf den Speicher der anderen Webadresse zugreifen.

## Kontrolle
Oben rechts muss `v4.0.0 · Sprint 8.6` stehen.
