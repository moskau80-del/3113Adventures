# 3113 Adventures – Sprint 10.5

## Kartenumschalter
Leaflet bleibt bestehen. Neu kann direkt auf der Karte zwischen drei Darstellungen gewechselt werden:

- Standard: OpenStreetMap Standard
- Wandern: OpenStreetMap + Waymarked Trails Wanderrouten
- Topografisch: OpenTopoMap

## Verhalten
- GPX-Track bleibt beim Kartenwechsel sichtbar.
- Etappen, Marker, bevorzugte Orte und Trackbearbeitung bleiben unverändert.
- Gewählter Kartenstil wird lokal gespeichert und beim nächsten Öffnen wieder verwendet.
- Umschalter ist für Desktop und Mobile optimiert.

## Hinweise
- OpenTopoMap hat maximal Zoomstufe 17.
- Waymarked Trails wird als transparente Wanderroutenebene über der Standardkarte eingeblendet.
- Keine neue Supabase-SQL-Anpassung erforderlich.
