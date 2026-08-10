# 3113 Adventures – Version 4.0.0 / Sprint 10.1

## Automatische Synchronisation
Unter `Einstellungen -> Cloud & mehrere Geräte` kann jetzt
`Änderungen automatisch synchronisieren` aktiviert werden.

### Verhalten
- lokale Änderungen werden nach kurzer Verzögerung automatisch hochgeladen
- alle 30 Sekunden wird geprüft, ob auf einem anderen Gerät ein neuer Cloud-Stand vorliegt
- beim App-Start wird ebenfalls geprüft
- nach Rückkehr aus dem Offline-Modus wird synchronisiert
- Statusanzeige:
  - ✓ Synchronisiert
  - Synchronisiere …
  - Offline – Änderungen ausstehend
  - Konflikt – bitte Cloud laden oder speichern

### Konfliktschutz
Wenn sowohl dieses Gerät als auch die Cloud seit der letzten bekannten
Synchronisation geändert wurden, überschreibt Sprint 10.1 keinen Stand
automatisch. Der Benutzer entscheidet dann über die bestehenden manuellen
Buttons `Cloud speichern` oder `Cloud laden`.

### Manuelle Cloud-Buttons
Bleiben als Backup-/Notfallfunktion erhalten.

### Supabase
Keine neue SQL-Datei erforderlich. Sprint 10.1 verwendet weiterhin
`user_sync_chunks` aus Sprint 10.0.2.
