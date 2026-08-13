# Projektanweisungen – Ergänzung für alle Weltraum-/Voxel-Agenten

Diesen Text in die Projektanweisungen übernehmen oder gemeinsam mit
`WELTRAUM_PROJECT_MEMORY.md` als verbindliche Projektdatei bereitstellen.

## Kanonischer Kontext

Lies vor jeder Arbeit:

1. `WELTRAUM_PROJECT_MEMORY.md`
2. `WELTRAUM_RESEARCH_REGISTER.md`
3. den konkreten Agentenauftrag
4. bei Codearbeit den aktuellen GitHub-Remote-SHA und die Repositoryregeln

Der derzeit akzeptierte Voxel-Lab-Integrations-SHA lautet:

`d95992df05952ac4be6221ca1809c1c9e3c0ac9d`

## Wahrheitsregeln

- GitHub-Remote, committed Tests, Golden Contracts und reproduzierbare Evidence haben Vorrang vor Chat-Zusammenfassungen.
- Research-Empfehlungen sind `PROPOSED`, bis sie ausdrücklich akzeptiert wurden.
- Veraltete Aussagen nicht still überschreiben; als `SUPERSEDED`, `REJECTED` oder `HISTORICAL` markieren.
- Keine fremden Benchmarks als eigene Messergebnisse ausgeben.
- Fakten, technische Schlussfolgerungen und Unsicherheiten klar trennen.
- Bei zeitabhängigen technischen Aussagen aktuelle Primärquellen verwenden.

## Architekturregeln

- Browser-/Chromium-first bleibt die aktuelle Entwicklungsstrategie.
- Harte quadratische Block-/Microvoxels; keine geglättete Low-Poly-Hauptdarstellung.
- Three.js ist aktuell der Mesh-Referenzpfad, nicht automatisch die endgültige Engine.
- CPU-Voxelzustand ist Authority; Rendererprodukte sind abgeleitet.
- Keine zweite World-Truth in Renderer, UI, Collision oder Tests.
- Keine vollständige Game-Engine, Physik, Planetstreaming und Art Direction in einem einzigen Auftrag.
- Keine Integration des Lab-Kerns in `Weltraum-Spiel` vor WP12 und einer expliziten Integrationsentscheidung.

## Parallelitätsregeln

- Maximal ein Write-Agent pro Repository.
- Beliebig viele read-only Research-Agenten parallel.
- Research-Agenten verändern keine Repositories und beginnen keine Implementierung.
- Ein Write-Agent bearbeitet genau ein Arbeitspaket, commitet, pusht und stoppt.
- Kein Implementierungsagent führt den Merge aus.
- Nur akzeptierte Commits werden per `--ff-only` integriert.

## Berichtsformat

Jeder Research-Bericht enthält:

- Titel und Datum;
- Basis-SHA(s);
- Quellen mit URLs/Versionen/Commits;
- Source Claims;
- Code Evidence;
- Inference;
- Unavailable/Unknown;
- Lizenzangaben;
- konkrete Findings;
- empfohlene kleine Folgegates;
- offene Unsicherheiten;
- keine unmarkierte Implementierung.

Jeder abgeschlossene Bericht wird im `WELTRAUM_RESEARCH_REGISTER.md` registriert.

## Visual- und Performance-Regeln

- Technische Tests ersetzen keine visuelle Owner-Freigabe.
- Concept Art ist Ziel-/Designreferenz, keine Runtime-Evidence.
- Timing-HUDs sind Diagnostik, solange kein Benchmarkprotokoll angewandt wurde.
- Keine Performanceaussage ohne Buildmodus, Browser, Hardware, Auflösung, DPR, Warm-up und Rohsample-Kontext.
- Square-Voxel-Invarianten dürfen nicht zur optischen Glättung aufgegeben werden.
