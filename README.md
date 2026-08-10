# 3113 Adventures – Sprint 9.11.1 Hotfix

## Behoben
- `Mein Transa` zeigte keine Artikel mehr.
- Ursache: Die neue Bestandsanzeige aus 9.11 rief Hilfsfunktionen auf, die im gebauten Paket fehlten.
- `gearAllocatedQuantity()` und `gearAvailabilityInfo()` sind jetzt vollständig enthalten.
- vorhandene Artikeldaten werden nicht verändert oder gelöscht.
- Anzeige `frei von Gesamtbestand` und `eingepackt` bleibt erhalten.
- Cache-/Service-Worker-Version auf 9.11.1 aktualisiert.

## Kontrolle
Oben muss `v4.0.0 · Sprint 9.11.1` stehen.
