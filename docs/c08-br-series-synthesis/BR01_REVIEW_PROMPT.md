# BR01 unabhängiger Reviewauftrag

## Rolle

Du bist der unabhängige Reviewer für BR01. Arbeite zunächst vollständig read-only. Du darfst Prüfungen ausführen, aber keine Quelldatei, keinen Lockfile und keine Evidenz ändern. Du führst keinen Merge aus und startest BR02 nicht.

## Exakte Vergleichsgrenze

- Repository: `BenjaminHornung/hestia-voxel-kernel-lab`
- Basis: `c64aeef1f51dd0ed2d8431411cf3ba1e84195b9d`
- Kandidatenbranch: `origin/agent/br-01-benchmark-contracts-provenance`
- Kandidaten-SHA: `<BR01_CANDIDATE_SHA>`

Vor dem Review nach Fetch belegen:

1. `origin/integration/voxel-kernel-lab-v1` steht weiterhin exakt auf der Basis.
2. `<BR01_CANDIDATE_SHA>` ist der Remote-Head des Kandidatenbranchs.
3. Merge-Base und Parent des ersten BR01-Commits sind exakt die Basis.
4. Der Review-Worktree ist sauber.

Bei Abweichung lautet das Urteil `REJECT`, ohne Reparaturversuch.

## Autoritative Prüfbasis

- `BR_SERIES_CONTRACT.md`
- `BR01_IMPLEMENTATION_PROMPT.md`
- BR01 Benchmark Contracts and Provenance Specification
- C07 Hardware Profiles H1-H3 Calibration Plan
- aktuelle Project Memory, Decision Log, Instructions und Research Register
- `AGENTS.md`

## Pflichtaudit

Prüfe den vollständigen Diff Basis..Kandidat und insbesondere:

- ausschließlich erlaubte BR01-Dateibereiche;
- genau eine gemeinsame Availability-/Capability-Union;
- exakte Hierarchie Hardwarezelle, Browserprozess, Run, Iteration, Sample;
- getrennte Prozesscontainer- und Samplephasen;
- gemeinsame ID-Typen, ohne konkrete BR03-ID-Erzeugung;
- formale Validierungsquittung ohne Zeitstempel oder Zufall;
- BR01 als alleiniger Besitzer von Szenario- und Metrikregister;
- vollständige Vereinigungsmenge aus BR01-Szenariometriken und BR04-Analysematrik samt Alias-Crosswalk;
- Effektband explizit pro Metrik oder `null`, kein globaler Default;
- `automaticDecision: "forbidden"`;
- technische Untergrenze 3 getrennt von Standardzell-Untergrenze 5 und Cold-Untergrenze 10;
- keine BR02-Erfassung, BR03-Orchestrierung, BR04-Statistik oder WP05-Arbeit;
- keine Schattenverträge;
- `ajv@8.20.0` exakt und ausschließlich als `devDependency`;
- keine AJV-Imports oder AJV-Inhalte in Produkt- oder Benchmark-Laufzeitbundles;
- Lockfile-Diff nur soweit durch AJV tatsächlich verursacht;
- AJV-Paket, exakte Version und MIT-Lizenz dokumentiert, ohne Projektlizenzänderung;
- keine Übernahme der WP04-Diagnosezeiten als Benchmarkwerte.

## Pflichtprüfungen

In dieser Reihenfolge:

1. `npm ci`
2. fokussierte BR01-Tests
3. vollständiges `npm test`
4. `npm run build`
5. statischer AJV-Import- und Bundle-Audit
6. Diff- und Schutzbereich-Audit

Browser-E2E ist `NOT_APPLICABLE_BR01_CONTRACT_ONLY`, sofern die aktuelle Repository-Regel keinen regulären Smoke-Test verlangt. Falls verlangt, führe nur `npm run test:e2e` aus. Führe niemals Evidence-Skripte aus.

Prüfe positive und negative Testabdeckung aus dem Implementierungsauftrag, nicht nur Testgrün. Manipuliere mindestens gedanklich oder mit temporären, nicht committeten Testinputs die Availability-Zweige, Hierarchiereferenzen, Registerreferenzen, Phasen, IDs und Quittungsdigests.

## Unveränderliche Schutzbereiche

Vergleiche Dateiliste und SHA-256-Digests zwischen Basis und Kandidat für:

- `tests/contracts/wp02FixtureGolden.ts`
- `tests/contracts/wp03GreedyGolden.ts`
- `tests/contracts/wp04AoGolden.ts`
- `evidence/wp01/**` bis `evidence/wp04/**`

Jede Abweichung ist mindestens `P0` und führt zu `REJECT`.

## Befundformat

Jeder Befund enthält:

- Schweregrad `P0`, `P1` oder `P2`;
- betroffene Datei und Symbol;
- reproduzierbaren Nachweis;
- verletzte Vertragsstelle;
- kleinste zulässige Korrektur;
- erforderlichen Regressionstest.

## Urteil

Gib genau eines aus:

- `ACCEPT`: keine offenen P0/P1-Befunde, alle Pflichtgates und Schutzprüfungen erfolgreich;
- `FIX_REQUIRED`: behebbarer P1 oder relevanter P2, mit präziser Fixliste;
- `REJECT`: falsche Basis, Schutzbereich-Drift, Scopebruch, Schattenvertrag oder grundlegende Vertragsverletzung.

Bei `FIX_REQUIRED` geht die Arbeit an denselben Implementierer auf demselben Branch zurück. Nach Push eines Fix-Commits wiederholst du den gesamten Review gegen dieselbe Basis und den neuen exakten Kandidaten-SHA. Der Reviewer repariert nicht selbst, mergt nicht und startet BR02 nicht.

Der Abschlussbericht nennt Basis, Kandidat, Parent, vollständige Befunde, Befehle und Zählungen, Dependency-Diff, Schutzbereich-Digests, Evidence-Hygiene und das einzelne Urteil. Danach stop.
