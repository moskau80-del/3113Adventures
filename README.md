# 3113 Adventures v4 – Sprint 10.9.3

## Änderungen
- Etappen: „Als Start“ und „Als Ziel“ übernehmen den gewählten Ort jetzt tatsächlich in die Etappe.
- Die Koordinaten des gewählten Orts werden als Start-/Zielkoordinate gespeichert.
- Der betroffene Etappenabschnitt wird über das bestehende Fuss-/Wanderrouting neu berechnet und in den Gesamttrack eingesetzt.
- Neues Ziel wird weiterhin als Start der nächsten Wanderetappe weitergegeben; neuer Start wird als Ziel der vorherigen Wanderetappe übernommen.
- Distanz, Aufstieg, Abstieg und Gehzeit der geänderten Etappe werden aus der neu gerouteten Strecke neu berechnet.
- Packlisten zeigen Kategorien entsprechend der gewählten Sprache auf Deutsch bzw. Englisch an.
- Keine Supabase-SQL-Änderung erforderlich.
