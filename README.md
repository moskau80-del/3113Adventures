# 3113 Adventures – Sprint 10.1.1

## Anmeldung dauerhaft speichern
- Supabase Auth verwendet explizit `localStorage`.
- eigene persistente Session unter `3113-adventures-auth`.
- `persistSession` bleibt aktiviert.
- Access Tokens werden automatisch erneuert (`autoRefreshToken`).
- beim App-Start wird eine vorhandene Session wiederhergestellt und geprüft.
- Abmelden löscht die Session weiterhin bewusst.

Damit muss sich der Benutzer auf einem Gerät normalerweise nur einmal anmelden.
