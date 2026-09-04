# 3113 Adventures – Sprint 10.8.2

## Cloud-Login-Hotfix
- Zeigt im Cloud-Bereich deutlich **„Angemeldet als: E-Mail“** an.
- Bei bestehender Session wird die E-Mail ins Loginfeld übernommen; das Passwort wird weiterhin nie angezeigt oder gespeichert.
- Neuer Button **„Passwort vergessen“** fordert über Supabase eine Reset-E-Mail an.
- Ein über den Reset-Link geöffneter PASSWORD_RECOVERY-Flow zeigt ein Feld zum Setzen eines neuen Passworts.
- Bestehende Session-Persistenz, Auto-Refresh und lokaler Cloud-Sync bleiben erhalten.
- Keine lokalen Tour-/GPX-/Packlisten-Daten werden beim Login-Fix gelöscht.

Keine Supabase-SQL-Anpassung erforderlich.

Hinweis: Für Passwort-Reset muss die veröffentlichte App-URL in Supabase Auth unter den erlaubten Redirect URLs zugelassen sein.
