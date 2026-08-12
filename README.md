# 3113 Adventures – Sprint 10.6

## Durchgängige Etappenplanung

Wenn sich das Ziel einer Etappe ändert, wird automatisch der Start der nächsten Wanderetappe angepasst.

### Gilt für
- Ziel manuell im Etappen-Dialog ändern
- bevorzugten Stopp ausdrücklich als Etappenziel übernehmen
- geometrisches Etappenende über den Track-Editor verändern

### Verhalten
Beispiel:
- Etappe 4: Ziel wird von `Ort A` auf `Ort B` geändert
- Etappe 5: Start wird automatisch zu `Ort B`

Liegt zwischen Etappe 4 und Etappe 5 ein Ruhetag, wird dieser übersprungen und die nächste Wanderetappe angepasst.

### Bevorzugte Stopps
Ein bevorzugter Stopp wird weiterhin **niemals automatisch** zum Etappenziel.
Die Weitergabe an die nächste Etappe erfolgt erst, nachdem der Benutzer den bevorzugten Stopp ausdrücklich als Etappenziel bestätigt hat.

Keine Supabase-SQL-Anpassung erforderlich.
