# 3113 Adventures – Version 4.0.0 / Sprint 5.1.2

## Speicherfehler behoben

- GPX-Teilstrecken werden nicht mehr in jeder Etappe dupliziert.
- Dadurch sinkt die Datenmenge der Etappen stark.
- Nach dem Speichern liest die App alle Etappen erneut aus IndexedDB.
- Eine Erfolgsmeldung erscheint nur, wenn die Anzahl wirklich stimmt.
- Bei einem Fehler wird die konkrete Fehlermeldung angezeigt.
- Alte, grosse Etappendatensätze werden beim Start automatisch komprimiert.

## Test

1. Etappen neu erzeugen.
2. Warten, bis „erfolgreich in IndexedDB gespeichert und geprüft“ erscheint.
3. App neu laden.
4. Es muss „Etappen aus IndexedDB geladen“ erscheinen.

Oben rechts muss `v4.0.0 · Sprint 5.1.2` stehen.
