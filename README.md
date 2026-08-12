# 3113 Adventures – Sprint 10.7

## Drag-&-Drop Trackplanung

Der vorhandene Trackeditor wurde auf eine Komoot-ähnlichere Bedienung umgestellt.

### Bedienung
- Etappe -> `Track bearbeiten`
- blauen Kontrollpunkt auf der Karte greifen und verschieben
- umliegende GPX-Punkte bewegen sich weich mit
- beim Loslassen wird standardmäßig automatisch über Fuss-/Wanderwege neu geroutet
- Klick auf die Karte fügt einen neuen Kontrollpunkt hinzu und routet danach neu
- Rechtsklick auf einen Zwischenpunkt entfernt ihn
- `Rückgängig` und `Original wiederherstellen` bleiben erhalten
- gespeichert wird weiterhin erst mit `Track speichern`

### Routing
Für das Fußrouting wird Valhalla im Pedestrian-Modus verwendet.
Falls der externe Routingdienst nicht erreichbar ist, bleibt die manuell verschobene
Trackvorschau bestehen und kann trotzdem gespeichert oder erneut bearbeitet werden.

### Kartenstil
Der Trackeditor übernimmt Standard-/Wander-/Topokarte soweit möglich.

Keine Supabase-SQL-Anpassung erforderlich.
