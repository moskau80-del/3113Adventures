# 3113 Adventures – Version 4.0.0 / Sprint 8.5

## Drag & Drop verbessert
- jede Artikelkarte hat jetzt einen sichtbaren Griff `↕ Ziehen`
- nur dieser Griff wird gezogen
- Zielbereiche für Person 1 und Person 2 sind klar beschriftet
- zusätzlich direkte Buttons `→ Person 1` und `→ Person 2` als einfache Alternative
- nach dem Ablegen wird automatisch die betreffende Personen-Packliste angezeigt

## CSV statt JSON
- Artikel-Export jetzt als CSV
- Semikolon als Trennzeichen, gut für deutschsprachiges Excel
- UTF-8 mit BOM für Umlaute
- Artikel-Import jetzt aus CSV
- Spalten:
  id;name;brand;category;weightG;stock;location;favorite;wishlist;notes
- vorhandene Artikel werden anhand der ID aktualisiert bzw. ergänzt

## Kontrolle
Oben rechts muss `v4.0.0 · Sprint 8.5` stehen.
