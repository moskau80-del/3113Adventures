# 3113 Adventures – Version 4.0.0 / Sprint 8.7

## Struktur neu
- `Mein Transa`: nur Artikelsuche, Filter, Aktionen und direkt darunter Artikelliste
- `Packlisten`: eigenes Register
- `Daten`: eigenes Register für CSV Import/Export
- `Drucken`: eigenes Register mit Artikelliste und Personen-Packlisten
- alte PackLager-Direktübernahme entfernt

## CSV Import erweitert
Unterstützt zusätzlich das Format:
Item Name, Category, desc, qty, weight, unit, url, price, worn, consumable

Zuordnung:
- Item Name -> Artikelname
- Category -> Kategorie
- desc -> Notizen
- qty -> Bestand
- weight -> Gewicht
- price -> Preis
- worn -> Standard getragen
- consumable -> Verbrauchsartikel

## Drucken
- Artikelliste
- Packliste Person 1
- Packliste Person 2
- Druckvorschau und Browser-Druckdialog

## Kontrolle
Oben rechts muss `v4.0.0 · Sprint 8.7` stehen.
