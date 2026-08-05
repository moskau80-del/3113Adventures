# 3113 Adventures – Version 4.0.0 / Sprint 5.1.4

## Neue Speicherstrategie

Die Etappen verwenden jetzt ausschliesslich denselben Browserspeicher, der auch für einfache lokale App-Daten zuverlässig funktioniert.

- kein IndexedDB mehr für Etappen
- ein einziger stabiler localStorage-Schlüssel
- sofortige Schreib- und Leseprüfung
- sichtbare Speicherdiagnose mit Anzahl, Grösse und verwendeter Domain
- kompakte Etappendaten ohne GPX-Punktlisten

## Test

1. Etappen erzeugen.
2. Die Speicherdiagnose muss eine Anzahl grösser als 0 zeigen.
3. Seite über exakt dieselbe Domain neu laden.
4. Die Diagnose muss dieselbe Anzahl zeigen.

Oben rechts muss `v4.0.0 · Sprint 5.1.4` stehen.
