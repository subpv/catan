'use strict';
// The progress overview shown in the demo ("Fortschritt" button) and written to PROGRESS.md (node demo/progress.js).
module.exports = {
  title: 'Broch – Fortschritt und Testliste (Stand: fertig, Wartungsmodus)',
  howto: [
    'Lobby: „New game“ → Modus wählen → „Create“ → mit „🤖 Add bot“ Bots dazunehmen (oder „Fill free seats with bots“) → „Start game“. Ohne Bots startest du nur mit echten Spielern (auf dem echten Server); in dieser Demo gibt es nur dich und Bots.',
    'Das „?“ auf jeder Kachel startet das Tutorial des Modus (rund 1 Minute, mit Bildern).',
    'Im Spiel: Handel → „Offer a trade“; die anderen können annehmen, ablehnen oder ein Gegenangebot machen.',
    'Spiele mit Bots zählen nicht für die Statistik.',
  ],
  modes: [
    { name: 'Classic (3–6 Spieler)', status: 'fertig', test: 'Aufbau, Handel inkl. Gegenangebot, 7 würfeln, Entwicklungskarten, 5–6 Spieler mit zwei Steinen (Stein 1 würfelt, Stein 2 nur Bank).', gaps: '–' },
    { name: 'Cities & Knights', status: 'fertig', test: 'Ritter, Stadtausbau, Barbaren, Fortschrittskarten, Aquädukt (einmal wählen, dann automatisch), Metropole.', gaps: '–' },
    { name: 'New Energies', status: 'fertig', test: 'Kraftwerke, Ereignis-Chips, Umweltbilanz, Inspektor bei der 7, Handel mit Gegenangebot.', gaps: '–' },
    { name: 'Rise of the Inkas', status: 'fertig', test: 'Stämme, Verfall mit Dornen, neuer Stamm, Handelsgüter-Tausch 3:2, Kampfkunst-Karten, Zufallslandschaft (Lobby-Schalter).', gaps: 'Die 2 reinen Ozeanfelder des echten Bretts sind nicht gezeichnet (keine Regelwirkung).' },
    { name: 'Seafarers', status: 'Beta', test: 'Schiffe, Inseln, Nebel, Szenarien aus dem Regelbuch.', gaps: 'Szenario 7 fehlt; Hafentypen nicht belegt.' },
    { name: 'Traders & Barbarians', status: 'Beta', test: 'Fischfang, Flüsse, Merchant Trains (Abstimmung, Wagen), Barbarenüberfall, Wagen-Szenario, Ereigniskarten, Freundlicher Räuber, Häfen; alle auch mit 5–6 Spielern.', gaps: 'Die 12 Zusatzkarten der 5–6-Box sind ein Platzhalter; die Variante für zwei Personen fehlt; einige Bretter (Brückenplätze, Fischgründe 5–6) aus Bildern gelesen.' },
    { name: 'Explorers & Pirates', status: 'Beta', test: 'Schiffe ziehen, Entdecker, Piratenlager, Fische, Gewürze, 5 Szenarien, 5–6 Spieler (Schiff 1 / Schiff 2).', gaps: 'Zahlen der Piratenlager der Grundbox unbekannt (die 5–6-Lager haben 9 und 10 laut Besitzer).' },
    { name: 'Dawn of Humankind', status: 'Beta', test: 'Weltkarte, Lager, Entdecker, Bedrohung, Fortschrittsleisten.', gaps: 'Brett aus den Buchbildern gelesen.' },
  ],
  news: [
    'Stand: fertig und im Wartungsmodus – der Besitzer arbeitet nicht weiter daran. Für Nachfolger (Mensch oder KI) liegen im Repository CLAUDE.md, docs/ARCHITECTURE.md, docs/OPERATIONS.md und docs/RULES-AND-GAPS.md.',
    'Abschlussprüfung: Sicherheit (Spielzüge werden geprüft und bei einem Fehler zurückgerollt, das Log lässt sich nicht fluten), Betrieb (beschädigte Dateien löschen keine Konten mehr, Werkzeug scripts/admin.js für vergessene Passwörter, Log-Begrenzung) und Oberfläche (Verbindungsabbrüche, Einladungslinks, Dialoge per Tastatur) geprüft und behoben.',
    'Bots: der Hänger bei erzwungenen Fortschrittskarten (Cities & Knights) ist behoben; das lebendige Brett startet auf Touchgeräten ausgeschaltet; die Seite lädt schneller.',
    'Gegenangebote beim Handel in allen Spielen.',
    'Bots: Host fügt sie in der Lobby hinzu (Gamer-Namen wie SnazzyTurnip); echter Server und Demo.',
    'Inka nach dem Almanach: Vorrat 20/12, Stapel 7+3, 3 Güter → 2 Rohstoffe, Gründung ohne Straße, Zufallslandschaft.',
    'Händler & Barbaren nach dem englischen Buch (6. Ausgabe): Kartenstapel, Wagen, Barbarenüberfall, Merchant Trains, 5–6-Spieler-Bretter.',
    'Beta-Schilder auf den Modi, bei denen noch Informationen fehlen.',
    'Alle Tutorials und Info-Texte wurden gegen die geänderten Regeln geprüft und angepasst (Handel, 5–6, Aquädukt, Metropole, Almanach …).',
  ],
  missing: [
    'Händler & Barbaren 5–6: Foto/Liste der 12 Zusatzkarten.',
    'Entdecker & Piraten: Zahlen der 6 Piratenlager der Grundbox (Foto der Plättchen).',
    'Optional: englische Bücher zu Entdecker & Piraten und Seefahrer, Fotos der Aufbruch-der-Menschheit-Karten.',
    'Bekannter Fehler (klein): Die Demo ignoriert die drei Schalter „show victory point cards at once“, „Build anytime“ und „Bigger start“ (demo/mock.js, drei Stellen); auf dem echten Server wirken sie.',
    'Nichts davon verhindert das Spielen: die Beta-Schilder zeigen nur, wo Daten aus den Büchern fehlen. Details für Entwickler: docs/RULES-AND-GAPS.md.',
  ],
};
