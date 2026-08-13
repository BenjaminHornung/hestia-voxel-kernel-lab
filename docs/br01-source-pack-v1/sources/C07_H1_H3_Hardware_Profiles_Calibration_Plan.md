# Abschlussbericht C07: H1-H3-Hardwareprofile und Kalibrierungsplan

**Datum:** 2026-08-12  
**Repository:** `BenjaminHornung/hestia-voxel-kernel-lab`  
**Verbindliche Research-Basis:** `d95992df05952ac4be6221ca1809c1c9e3c0ac9d`  
**Dokumenttyp:** implementierungsreife Spezifikation und Reviewgrundlage  
**Gesamtstatus:** `REQUIRES_OWNER_DECISION`  
**Ausführung:** statische Cloud-Planung; keine Implementierung, kein Build, kein Browserlauf und kein Benchmark

## 0. Entscheidung in Kurzform

1. `H1-DESKTOP-DGPU` kann mit dem vorhandenen Ryzen 9 7950X3D, 64 GB RAM, Radeon RX 7900 XTX und Windows 11 besetzt werden. Dieses Gerät ist eine High-End-Entwicklungsbaseline, keine Annäherung an den typischen oder minimalen Zielrechner.
2. `H2-MAINSTREAM-IGPU` muss ein einzelnes, exakt identifiziertes und dauerhaft wiederverwendbares Mainstream-Gerät mit realer integrierter GPU werden. Geeignete Kategorien sind ein normaler Windows-11-U-/P-Klasse-Laptop oder Mini-PC mit 16-GB-Klasse und aktivem Shared-Memory-iGPU-Pfad. Intel- und AMD-Geräte werden nicht als dasselbe H2 zusammengefasst.
3. `H3-MINIMUM-TARGET` kann erst endgültig ausgewählt werden, wenn der Owner festlegt, ob die Mindesthardware WebGPU selbst unterstützen muss oder ob auf H3 nur der WebGL2-Meshfallback produktiv gefordert ist. Ein künstlich gedrosseltes H1- oder H2-System ist kein Ersatz für ein echtes schwächeres Gerät.
4. `CI-CORRECTNESS`, `EDGE-COMPAT` und `CHROME-BETA` sind keine drei weiteren Hardwareklassen. Sie sind Ausführungs- beziehungsweise Browserzellen. Edge Stable und Chrome Beta sollen standardmäßig auf demselben physischen H2-Gerät wie Chrome Stable laufen, damit Browser- und Hardwareeffekt getrennt bleiben.
5. Blockierende Performanceaussagen dürfen nur aus headed Runs auf einer verifizierten Hardware-GPU stammen. Headless CI, SwiftShader oder eine nicht identifizierte Cloud-GPU bleiben Korrektheits- oder Kompatibilitätsevidenz.
6. Dieser Bericht setzt keinerlei absolute Latenz-, Durchsatz-, Speicher- oder Framezeitgrenze. BR-06 darf solche Grenzen erst aus akzeptierten Rohdaten, Produktbegründung und unabhängiger Prüfung ableiten.

Der Vertrag ist technisch bereit zur späteren Umsetzung. Der Gesamtstatus bleibt dennoch `REQUIRES_OWNER_DECISION`, weil zwei profilbestimmende Angaben fehlen: das konkrete H2-Gerät und die Produktdefinition von H3.

## 1. Scope, Quellenlage und Aussageklassen

### 1.1 Verbindliche Projektfakten

Die folgenden Punkte stammen aus den akzeptierten Projektquellen und sind keine neue Entscheidung dieses Berichts:

- Browser-/Chromium-first, harte quadratische Voxel und CPU-Zellauthority bleiben gesetzt.
- Three.js/WebGL2 ist der aktuelle Mesh-Referenzpfad, nicht automatisch die endgültige Engine.
- Aktuelle WP03-Zeiten sind ausschließlich Diagnostik.
- Der Benchmarkpfad speichert Rohsamples und bindet Source, Build, Fixture, Szenario, Browser, Hardware, Treiber, Anzeige, Energiezustand und Messphase.
- Cold, Warm-up, Measurement, Stress und Trace bleiben getrennte Runs.
- BR-01 bis BR-04 liegen nach akzeptierter und integrierter WP04 und vor WP05. BR-05 liegt spätestens vor WP08. BR-06 liegt vor WP12.
- WP12 verlangt für den Backendvergleich mindestens reale GPU-Hardware auf H1 und H2. Das hier definierte H3 ergänzt die notwendige Minimum-Target-Guardrail.

Quellen: `WELTRAUM_PROJECT_INSTRUCTIONS_ADDENDUM(1).md`, `WELTRAUM_PROJECT_MEMORY(1).md`, `WELTRAUM_RESEARCH_DECISION_LOG_2026-08-12.md`, `WELTRAUM_RESEARCH_SYNTHESIS_2026-08-12.md` und `07_benchmark_test_methodology_audit_report(1).md`.

### 1.2 Aktuelle externe Primärquellen

- Playwright unterstützt die branded Channels `chrome`, `msedge`, `chrome-beta` und `msedge-beta`. Quelle: [Playwright Browser Channels](https://playwright.dev/docs/browsers#google-chrome--microsoft-edge).
- Chrome for Testing stellt versionierte, nicht automatisch aktualisierte Chrome-Binaries aus Stable-, Beta-, Dev- und Canary-Releases für Testzwecke bereit. Quelle: [Chrome for Testing](https://developer.chrome.com/docs/automation-and-testing/chrome-for-testing).
- CDP `SystemInfo.getInfo` liefert unter anderem GPU-Geräte, PCI-IDs soweit verfügbar, Treibervendor, Treiberversion, Featurestatus und Browser-Command-Line. Quelle: [Chrome DevTools Protocol SystemInfo](https://chromedevtools.github.io/devtools-protocol/tot/SystemInfo/).
- Chrome unterscheidet in `chrome://gpu` ausdrücklich zwischen hardwarebeschleunigtem WebGPU und Software-only. Quelle: [Chrome WebGPU Troubleshooting](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips).
- Windows 11 führt getrennte Power Modes für Netz- und Akkubetrieb. Quelle: [Microsoft: Power mode ändern](https://support.microsoft.com/en-us/windows/change-the-power-mode-for-your-windows-pc-c2aff038-22c9-f46d-5ca0-78696fdf2de8).
- AMD Adrenalin kann Radeon-Metriken protokollieren; Ryzen Master stellt unter anderem Temperaturen, Takt und Spannungen bereit. Quellen: [AMD Adrenalin Performance Metrics](https://www.amd.com/en/resources/support-articles/faqs/DH3-038.html) und [AMD Ryzen Master](https://www.amd.com/en/products/software/ryzen-master.html).

### 1.3 Technische Schlussfolgerungen dieses Berichts

- Browserzellen müssen von Geräteprofilen getrennt werden, sonst können Browser- und Hardwareunterschiede nicht kausal eingeordnet werden.
- Ein Profilname wie H2 reicht nicht als Provenienz. H2 bezeichnet genau ein kanonisches Geräteexemplar mit eigener pseudonymer ID und Hardware-Revision.
- Temperatur allein beweist kein Thermal Throttling. Die Klassifikation benötigt Sensorquelle, Takt- oder Leistungsentwicklung und, falls verfügbar, einen direkten Limit- beziehungsweise Throttle-Grund.
- Cloud-GPU ist eine eigene Umgebungsart. Sie darf nicht still als physisches H1, H2 oder H3 ausgegeben werden.
- Der kanonische Rendervertrag muss Canvas-Backbuffer, CSS-Größe, DPR und physischen Display-Refresh getrennt speichern. Nur "1920 x 1080" wäre mehrdeutig.

### 1.4 Noch unbekannt

- konkretes H2-Gerät;
- konkrete H3-Untergrenze und WebGPU-Pflicht auf H3;
- Zielbrowser außerhalb Chrome Stable und Edge Stable;
- Relevanz eines produktiven Akkubetriebs;
- dauerhaft verfügbarer Sensorpfad auf H2/H3;
- endgültige Baseline-SHA zum Zeitpunkt von BR-06;
- spätere absolute Performancebudgets.

### 1.5 Nicht durchgeführt und Provenienz

Es wurden keine Tests, Builds, Browserläufe, Telemetriecaptures oder Benchmarks ausgeführt. Es wurde kein Repository geklont oder verändert und kein Fremdcode übernommen. Der Bericht nutzt Dokumentation als Quelle und enthält nur Spezifikationstext. Laut R06/R07 besitzt der geprüfte Lab-Baum am Basis-SHA keine LICENSE-Datei; dieser Bericht ändert oder löst diesen separaten Lizenzpunkt nicht.

## 2. Normatives Modell

Die Begriffe **MUSS**, **DARF NICHT**, **SOLL** und **KANN** sind normativ.

Eine spätere Messung besteht aus drei voneinander getrennten Datensätzen:

| Datensatz | Lebensdauer | Inhalt | Zweck |
|---|---|---|---|
| `HardwareProfileV1` | stabil bis zu einer Hardwareänderung | Rolle, Gerät, CPU, RAM, GPU, Herkunft, Firmware- und Kühlklasse | benennt das Messgerät |
| `EnvironmentCaptureV1` | für jeden Browserprozess beziehungsweise Run | OS, Treiber, Browser, Flags, Display, Power, Thermal, Fokus, Hintergrundlast | beschreibt den tatsächlichen Laufzustand |
| `MeasurementCellKeyV1` | pro Aggregationszelle | alle Vergleichsdimensionen aus Source, Szenario, Gerät und Umgebung | verhindert unzulässige Aggregation |

Ein Update des Browsers erzeugt kein neues physisches Geräteprofil, aber eine neue Messzelle. Ein RAM-, GPU-, BIOS- oder Kühlerwechsel erhöht dagegen `hardwareRevision` und erzeugt eine neue Gerätefassung.

## 3. Hardware Profile Contract v1

### 3.1 Identität und Provenienz

Jedes H1-H3-Gerät MUSS mindestens folgende Felder besitzen:

| Feld | Pflicht | Regel |
|---|---:|---|
| `contractVersion` | ja | exakt `hardware-profile-contract-v1` |
| `profileId` | ja | `H1-DESKTOP-DGPU`, `H2-MAINSTREAM-IGPU` oder `H3-MINIMUM-TARGET` |
| `deviceInstanceId` | ja | pseudonyme, stabile Projekt-ID; keine Seriennummer |
| `hardwareRevision` | ja | beginnt bei 1; steigt bei messrelevanter Hardware- oder Firmwareänderung |
| `selectionStatus` | ja | `candidate`, `selected`, `suspended` oder `retired` |
| `role` | ja | Entwicklungsbaseline, Mainstream-Ziel oder Minimum-Ziel |
| `sourceClass` | ja | `owner`, `household`, `friend`, `work-approved`, `remote-physical` oder `cloud-supplemental` |
| `consentStatus` | ja | bei fremden oder betrieblichen Geräten ausdrücklich bestätigt |
| `firstCapturedUtc` | ja | UTC-Zeitpunkt der Inventarisierung |
| `captureOperator` | ja | pseudonyme Rolle, keine private Personendetailpflicht |
| `notes` | nein | Leihfrist, Restriktionen, bekannte Defekte, Dock-/Lid-Vorgaben |

Seriennummern, Benutzername, Kontoname, Asset-Tag eines Arbeitgebers und private Dateipfade DARF der persistierte Bericht nicht enthalten. Falls ein Betriebssystemexport solche Daten enthält, werden sie vor dem Evidence-Bundle redigiert und das Redaktionsverfahren dokumentiert.

### 3.2 Hardwarefelder

| Gruppe | Pflichtfelder |
|---|---|
| Formfaktor | Desktop, Notebook oder Mini-PC; Hersteller; Modellfamilie; genaue SKU soweit ohne Seriennummer möglich |
| CPU | Vendor, vollständiges Modell, Architektur, physische und logische Kerne, hybride P-/E-Kernaufteilung falls vorhanden |
| RAM | installierte Bytezahl, Modulzahl, Kanalmodus, effektive Datenrate, shared-memory-relevante Konfiguration |
| GPU | Vendor, vollständiges Modell, iGPU/dGPU/vGPU, PCI Vendor-/Device-ID soweit verfügbar, dedizierter oder geteilter Speicher, erwarteter aktiver Adapter |
| Mainboard/Firmware | Mainboard- oder OEM-Modell, BIOS/UEFI-Version, BIOS-Datum; relevante Performance-/Eco-/OC-Einstellungen |
| Kühlung | Kühlerklasse, Notebook-Lid-/Dockzustand, OEM-Fanprofil, externe Kühlhilfen, bekannte thermische Einschränkungen |
| Displaypfad | internes oder externes Display, Verbindung, aktivierter Adapterpfad, MUX-/Hybridmodus falls vorhanden |

Ein Laptop mit zusätzlicher dGPU kann H2 nur besetzen, wenn der Browser nachweislich auf der iGPU läuft. Das bloße Auswählen einer Windows-Grafikpräferenz genügt nicht; der tatsächliche Adapter muss im Run-Capture bestätigt werden.

### 3.3 `EnvironmentCaptureV1`

Pro Browserprozess werden mindestens folgende Werte erfasst:

| Gruppe | Pflichtfelder |
|---|---|
| Source | Repository, `sourceTreeSha`, Build-Hash, dirty=false, Fixture-/Scenario-/Protocol-/Schema-Version |
| OS | Produkt, Edition, vollständiger Build, Kernel, Patchstand, Architektur, Hypervisor-/VBS-Zustand soweit verfügbar |
| Firmware | aktive Hardware-Revision, BIOS/UEFI-Version und Datum |
| Browser | Produkt, vollständige Version, Channel, ausführbare Datei oder Binärdigest, User Agent, Launch-Flags, Command-Line redigiert |
| Grafikruntime | aktiver GPU-Adapter, Hardware/Software/Unknown, Treiber, WebGL-Renderer, WebGPU-Adapterinfo, Graphics Backend, Featurestatus, optionale Features und Limits |
| Execution | headed/headless, lokaler oder virtueller User-Desktop, sichtbarer/fokussierter Tab, Hintergrundtabs, Browserprofil-ID, Workerzahl |
| Renderfläche | CSS-Canvasgröße, Backbuffergröße in Device Pixels, Viewport, Fenstergröße, DPR, Browserzoom |
| Display | physische Auflösung, Refresh-Rate, Skalierung, VSync-Vertrag, internes/externes Display, HDR-/VRR-Zustand |
| Power | AC/Battery, Windows Power Mode, aktiver Power-Scheme-Identifier, OEM-Leistungsmodus, Ladegerätklasse, Akku Start/Ende |
| Thermal | Evidence-Level, Sensorquelle und Version, Samplingintervall, CPU/GPU-Temperatur-, Takt- und Powerverlauf soweit verfügbar, Limitgründe, Klassifikation |
| Umgebung | Datum/Uhrzeit, Raumtemperatur falls verfügbar, Lid-/Dock-/Fanstatus, konkurrierende CPU/GPU/RAM-Last vor und während des Laufs |
| Browserzustand | `document.visibilityState`, Fokus, Page Errors, Crash, Context Loss, GPU Disjoint, Device Loss |

Wenn CDP- und Betriebssystemangaben bei GPU oder Treiber voneinander abweichen, werden beide Rohwerte gespeichert. Der Lauf darf die Abweichung nicht still auflösen.

### 3.4 Verifikation einer echten GPU

`gpuExecutionClass=hardware` darf nur gesetzt werden, wenn alle verfügbaren Belege zusammenpassen:

1. CDP nennt das erwartete Gerät und meldet keine reine Softwareausführung für den verwendeten Pfad.
2. WebGL Vendor/Renderer enthält keinen bekannten Softwareadapter wie SwiftShader oder llvmpipe.
3. Für WebGPU-Runs meldet Chrome den Pfad als hardwarebeschleunigt und die Adapterinfo passt zum Zielgerät.
4. Treiber und Graphics Backend sind nicht `unknown`.

Bei Widerspruch lautet die Klasse `unknown`; der Run bleibt für Korrektheit verwendbar, aber nicht für Performance. `software` und `unknown` dürfen niemals als H1-H3-Performancewert erscheinen.

### 3.5 Kanonischer Displayvertrag

Empfohlene kanonische Zelle, vorbehaltlich Owner-Freigabe:

```text
Canvas CSS:           1920 x 1080
DPR:                  1
Canvas Backbuffer:    1920 x 1080 Device Pixels
Display Refresh:      60 Hz
VSync:                Browser-/OS-Standard, keine undokumentierten Disable-Flags
Browser Zoom:         100 Prozent
Modus:                headed, sichtbar, fokussiert
```

Diese Werte sind ein kontrollierter Workloadvertrag und keine Performancegrenze. Fenstergröße, Viewport und physische Displayauflösung werden zusätzlich erfasst. Der Canvas darf nicht unbemerkt durch Browserchrome, OS-Skalierung oder Responsive Layout kleiner werden.

Zusatzfelder wie 2560 x 1440 bei DPR 1 oder 1920 x 1080 CSS bei DPR 2 sind eigene Pixelstress-Zellen. Native High-Refresh-Runs sind ebenfalls eigene Zellen. Sie werden nicht mit der kanonischen 60-Hz-Zelle vermischt.

### 3.6 `MeasurementCellKeyV1`

Der kanonische Zellschlüssel MUSS mindestens aus folgendem Tupel gebildet werden:

```text
sourceTreeSha
buildSha256
fixtureContractId + fixtureContractVersion + fixtureHash
protocolVersion + schemaVersion + aggregatorHash
scenarioId + scenarioVersion + scenarioSeedSet
candidateId + backend + mesher + chunkEdge + workerCount
deviceInstanceId + hardwareRevision
osProduct + osBuild + firmwareVersion
browserProduct + browserChannel + browserFullVersion + browserBinaryDigest
gpuVendorId + gpuDeviceId + gpuDriver + graphicsBackend + gpuExecutionClass
headed + localPhysicalClass
canvasDeviceWidth + canvasDeviceHeight + dpr + refreshHz + vsyncContract
powerSource + windowsPowerMode + powerSchemeId + oemPowerMode
thermalEvidenceLevel + thermalClassification
executionPhase
```

Ein fehlendes Pflichtfeld macht den Run nicht automatisch technisch falsch, aber `measurementEligible=false`, solange es nicht durch eine versionierte Contractänderung ausdrücklich optional gemacht wurde. Unbekannte Werte werden als `unknown` gespeichert und niemals durch Annahmen ersetzt.

## 4. Zweck und Mindestprovenienz der sechs Profile

### 4.1 Profilübersicht

| Profil | Tatsächliche Rolle | Standardgerät | Browsermodus | GPU-Klasse | Gate-Verwendung |
|---|---|---|---|---|---|
| `H1-DESKTOP-DGPU` | Entwicklungs- und High-End-Baseline | vorhandener Desktop | Chrome Stable headed | reale dGPU | Charakterisierung, Regressionsvergleich, GPU-Backend |
| `H2-MAINSTREAM-IGPU` | repräsentatives Mainstream-Ziel | auszuwählender Laptop/Mini-PC | Chrome Stable headed | reale iGPU | primäre Zielzelle |
| `H3-MINIMUM-TARGET` | bewusst unterstützte Untergrenze | auszuwählendes schwächeres Gerät | Chrome Stable headed | echte Ziel-GPU | Guardrail, kein Durchschnitt |
| `CI-CORRECTNESS` | reproduzierbare Korrektheit | gepinnter Runner | pinned Chromium/Chrome headless | Software-GPU zulässig | Unit, Schema, Property, E2E, deterministische CI-Evidence |
| `EDGE-COMPAT` | Browserkompatibilität | standardmäßig dasselbe H2 | Edge Stable headed | dieselbe reale H2-iGPU | Funktionsgate, Performance nur informativ |
| `CHROME-BETA` | Frühwarnung vor Browseränderungen | standardmäßig dasselbe H2 | Chrome Beta headed | dieselbe reale H2-iGPU | informativ, kein alleiniger Releaseblocker |

### 4.2 H1: vorhandener Kandidat

**Owner-provided Fakten:**

```text
CPU: Ryzen 9 7950X3D
RAM: 64 GB
GPU: Radeon RX 7900 XTX
OS: Windows 11
```

**Noch zu erfassen:**

- genaue Windows-Edition und Build;
- Mainboard, BIOS/AGESA und BIOS-Performanceeinstellungen;
- RAM-Module, Kanalmodus und Datenrate;
- exaktes GPU-Board, VBIOS, Treiber und Tuningprofil;
- CPU-/GPU-Kühlung und Fanprofil;
- Monitorpfad, physische Auflösung, 60-Hz-Fähigkeit, VRR/HDR und OS-Skalierung;
- Windows Power Mode und aktives Schema;
- Chrome-Build und Flags;
- Thermal-Logging-Quelle und deren Overhead.

**Rollenbegrenzung:** H1 darf Entwicklungsregressionen und High-End-Potenzial zeigen. Es darf nicht als Nachweis dienen, dass Mainstream- oder Minimum-Hardware genügt.

### 4.3 H2: realistische Gerätekategorien

H2 soll genau ein tatsächlich genutztes Mainstream-Gerät sein. Geeignete Kategorien:

1. normaler Windows-11-Notebookprozessor der U-/P-Klasse mit integrierter Intel-Grafik und 16-GB-Klasse;
2. normaler Windows-11-Notebookprozessor der U-Klasse mit integrierter AMD-Radeon-Grafik und 16-GB-Klasse;
3. vergleichbarer Mini-PC mit mobiler CPU/iGPU, Standard-Powerlimit und Dual-Channel- beziehungsweise dokumentierter Shared-Memory-Konfiguration.

Nicht geeignet als kanonisches H2:

- Gaming-Laptop, dessen dGPU den Browser tatsächlich rendert;
- Desktop-High-End-APU mit ungewöhnlich hohem Powerlimit, wenn sie nicht dem Zielmarkt entspricht;
- VM, Remote-Desktop-Grafikadapter oder SwiftShader;
- Gerät mit beschädigter Kühlung oder nicht reproduzierbarem OEM-Turbomodus;
- Pool aus mehreren unterschiedlichen Laptops unter derselben Profil-ID.

Wenn sowohl Intel- als auch AMD-iGPU-Geräte verfügbar sind, wählt der Owner eines als kanonisches H2. Das andere kann als `H2-VENDOR-CROSSCHECK` informativ geführt werden, bleibt aber eine separate Messzelle.

### 4.4 H3: zwei mögliche Mindestverträge

Die Geräteauswahl hängt von einer Produktentscheidung ab:

| Variante | Zweck | Geeignete Kategorie | Konsequenz für WP12 |
|---|---|---|---|
| `H3-WEBGL2-FALLBACK` | niedrigste produktiv unterstützte Hardware kann WebGPU verfehlen | unterstütztes Windows-11-Einstiegsgerät oder älteres Mainstream-U-Klasse-Gerät mit 8-GB-Klasse und echter WebGL2-iGPU | WebGL2 muss auf H3 bestehen; WebGPU-Ergebnis darf dort `unsupported` sein |
| `H3-WEBGPU-MINIMUM` | jede Zielhardware muss WebGPU hardwarebeschleunigt ausführen | schwächste real verfügbare, unterstützte Windows-11-iGPU-Klasse, die den WebGPU-Capability-Vertrag erfüllt | WebGPU-Backend muss auch auf H3 korrekt und messbar sein |

Die beiden Varianten dürfen nicht nachträglich vermischt werden. H3 wird nicht über Baujahr, künstliche CPU-Limits oder reduzierte Browserflags definiert, sondern über eine explizite Produktuntergrenze und ein reales Gerät.

### 4.5 CI-CORRECTNESS

Mindestprovenienz:

- Runnerprovider, Runnerimage und Imageversion;
- CPU-Architektur und gemeldete Ressourcen;
- Virtualisierungsart soweit verfügbar;
- exakter Browserbuild und Playwrightversion;
- headless=true;
- GPU-Klasse `software`, `hardware` oder `unknown`;
- Auflösung, DPR und Font-/OS-Baseline;
- Workflow-Hash und Source-/Build-Hash.

CI-CORRECTNESS darf Golden-, Property-, Schema-, E2E- und Screenshot-Korrektheit prüfen. Es darf keine finale H1-H3-Performance vertreten. Ändert sich das Runnerimage, entsteht eine neue Screenshot- und Environment-Baseline.

### 4.6 EDGE-COMPAT

Edge Stable wird standardmäßig headed auf demselben H2-Gerät, derselben OS-/Treiber-/Display-/Powerkonfiguration und demselben Szenario wie Chrome Stable ausgeführt. Nur Browserprodukt und Browserbuild dürfen variieren. Ein Funktionsfehler blockiert die erklärte Edge-Unterstützung. Ein Performanceunterschied ist zunächst informativ und wird nicht mit Chrome aggregiert.

### 4.7 CHROME-BETA

Chrome Beta läuft ebenfalls auf demselben H2-Gerät. Es dient der Früherkennung von WebGL-, WebGPU-, CDP-, Screenshot- oder Schedulingänderungen. Ein reiner Beta-Fehler ist ein Frühwarnsignal. Er wird erst Release-blockierend, wenn der Owner dies explizit beschließt oder der Fehler in Stable reproduziert wird.

Für reproduzierbare Kalibrierungsruns SOLL ein exakter Chrome-for-Testing-Build verwendet oder der installierte branded Browserbuild vollständig erfasst und während einer Messzelle nicht aktualisiert werden. Ein Browserupdate teilt die Zelle.

## 5. Vollständige Sollmatrix

| Feld | H1 | H2 | H3 | CI | Edge | Chrome Beta |
|---|---|---|---|---|---|---|
| OS | Windows 11, exakter Build | Windows 11, exakter Build | unterstütztes OS, empfohlen Windows 11 | Runnerimage | identisch H2 | identisch H2 |
| CPU-Klasse | High-End Desktop | Mainstream Mobile/Mini-PC | definierte Minimum-Klasse | ephemer/virtuell möglich | identisch H2 | identisch H2 |
| Grafik | RX 7900 XTX dGPU | reale iGPU | echte Minimum-GPU | Software zulässig | identisch H2 | identisch H2 |
| RAM | 64 GB, Topologie erfassen | typischerweise 16-GB-Klasse, exakt erfassen | typischerweise 8-GB-Klasse oder Owner-Floor | Runnerwert | identisch H2 | identisch H2 |
| Browser | Chrome Stable | Chrome Stable | Chrome Stable | pinned Chromium/Chrome | Edge Stable | Chrome Beta |
| Treiber | exakte Version | OEM-/Vendor-Treiber exakt | exakte Version | Imagewert | identisch H2 | identisch H2 |
| Power | AC, fester Modus | AC primär | AC primär | N/A oder Runnerklassifikation | identisch H2 | identisch H2 |
| Display | kanonische Zelle | kanonische Zelle | kanonische Zelle sofern darstellbar | virtuelle fixe Zelle | identisch H2 | identisch H2 |
| Headed | ja | ja | ja | nein | ja | ja |
| echte GPU nötig | ja | ja | ja für Performance | nein | ja für Zielkompatibilität | ja für Frühwarnung |
| Ergebnisrolle | Baseline | Ziel | Guardrail | Korrektheit | Kompatibilität | Frühwarnung |

RAM-Klassen sind Gerätekategorien, keine erfundenen Performancegates. Der konkrete Bytewert und die Speicherkanalkonfiguration werden immer gespeichert.

## 6. Environment-Capture-Checkliste

### 6.1 Einmalig bei Geräteaufnahme

- [ ] Profil-ID, pseudonyme Geräte-ID und Hardware-Revision vergeben.
- [ ] Herkunft und Nutzungszustimmung dokumentieren.
- [ ] Formfaktor, Hersteller, Modellfamilie und SKU ohne Seriennummer erfassen.
- [ ] CPU-Modell, physische/logische Kerne und hybride Topologie erfassen.
- [ ] RAM-Kapazität, Module, Kanäle und Datenrate erfassen.
- [ ] GPU-/iGPU-Modell, PCI-IDs und Speicherart erfassen.
- [ ] Mainboard/OEM, BIOS/UEFI und relevante Tuning-/Eco-/OC-Einstellungen erfassen.
- [ ] Kühlung, Lüftermodus, Laptop-Lid, Dock und MUX-/Hybridmodus erfassen.
- [ ] Gerätespezifische Sensorquellen und deren Versionen festlegen.
- [ ] Bekannte Einschränkungen und Leihfrist dokumentieren.

### 6.2 Vor jedem Runblock

- [ ] Source-SHA, Build-Hash, Fixture-, Scenario-, Protocol- und Schema-Version fixieren.
- [ ] Dirty-State muss false sein.
- [ ] OS-Build, Browserbuild, Treiber, BIOS und Hardware-Revision mit der geplanten Zelle abgleichen.
- [ ] Neustart-/Uptimezustand nach vordefinierter Regel erfassen.
- [ ] Windows Power Mode, Power Scheme und OEM-Leistungsmodus prüfen.
- [ ] Bei Notebook: AC/Battery, Ladegerätklasse, Akkustand, Lid, Dock und externes Display prüfen.
- [ ] Displayauflösung, Skalierung, Refresh, HDR, VRR und Browserzoom prüfen.
- [ ] Nicht benötigte Hintergrundlast nach festem Verfahren schließen; Idle-CPU/GPU/RAM erfassen.
- [ ] Gerät in den vordefinierten thermischen Ausgangszustand bringen.
- [ ] Sensorlogging starten, Toolversion und Samplingintervall speichern; kein sichtbares Overlay im Gatepass.

### 6.3 Nach Browserstart, vor dem Messfenster

- [ ] `Browser.getVersion` und redigierte Launch-Command-Line erfassen.
- [ ] CDP `SystemInfo.getInfo` erfassen.
- [ ] WebGL Vendor/Renderer und Backend erfassen.
- [ ] WebGPU-Adapter, Features und Limits erfassen, wenn das Szenario WebGPU verwendet.
- [ ] Hardware-/Software-GPU-Klasse verifizieren.
- [ ] Headed/Headless, Viewport, Canvas-CSS-Größe, Backbuffer und DPR verifizieren.
- [ ] `document.visibilityState=visible`, Fokus und Hintergrundtabzahl verifizieren.
- [ ] Canvas vollständig sichtbar und nicht verdeckt halten.
- [ ] Capability-Fehler als Ergebnis speichern, nicht durch Flag-Experimente im selben Run korrigieren.

### 6.4 Während des Messfensters

- [ ] Keine DevTools, Screenshots, Traces oder Heap-Snapshots im Gatepass.
- [ ] Keine automatische Wiederholung eines ungünstigen gültigen Runs.
- [ ] Powerquelle, Power Mode, Fokus, Sichtbarkeit und Displayvertrag unverändert halten.
- [ ] Temperatur-, Takt- und Powertelemetrie nur über den vorher akzeptierten Low-Overhead-Pfad sammeln.
- [ ] Crash, Page Error, Context Loss, GPU Disjoint, Device Loss, Sleep oder Fokusverlust markieren.
- [ ] Rohsamples append-only puffern und erst nach dem zeitkritischen Fenster schreiben.

### 6.5 Nach jedem Runblock

- [ ] Akkustand Ende, Temperatur-/Takt-/Powerverlauf und Limitgründe sichern.
- [ ] Browser-, GPU- und Workerfehler sichern.
- [ ] Thermal-Klassifikation setzen.
- [ ] Messberechtigung und einen normierten Invalidierungsgrund setzen.
- [ ] Raw-, Manifest-, Aggregate- und Tool-Digests sichern.
- [ ] Prüfen, ob Browser, Treiber, Power oder Display innerhalb des Blocks wechselten.
- [ ] Keine Messzelle aus Teilruns mit abweichender Umgebung zusammensetzen.

## 7. Thermal-Throttling-Vertrag

### 7.1 Warum eine Temperaturzahl nicht genügt

Moderne CPUs und GPUs regeln Frequenz anhand von Temperatur, Leistung, Strom, aktiven Kernen und Firmwaregrenzen. Ein niedrigerer Takt kann ein Thermal-, Power-, Current- oder Workloadlimit sein. AMD beschreibt diese Mehrfachabhängigkeit ausdrücklich für Precision Boost 2. Quelle: [AMD Precision Boost 2](https://www.amd.com/en/resources/support-articles/faqs/CPU-PB2.html).

Der Bericht verwendet deshalb keine erfundene Temperaturgrenze. Maßgeblich sind die dokumentierte Herstellergrenze des konkreten Geräts, direkte Limitgründe soweit verfügbar und der korrelierte Verlauf.

### 7.2 Thermal-Evidence-Level

| Level | Verfügbare Evidenz | Verwendung |
|---|---|---|
| `T0` | keine belastbaren Sensorwerte | Korrektheit; Performance nur informativ und ausdrücklich thermal-unobservable |
| `T1` | Temperatur, effektiver Takt und Szenariofortschritt über Zeit | Baseline möglich, wenn stabil und ohne Verdachtsmuster |
| `T2` | T1 plus Hersteller-/OEM-Limit- oder Throttle-Gründe und Powerwerte | bevorzugt für finale Kalibrierung |

Fehlende T2-Telemetrie darf ein normales Consumergerät nicht automatisch ausschließen. Sie reduziert aber die Aussagekraft und muss im Review sichtbar bleiben.

### 7.3 Klassifikationen

| Wert | Bedeutung |
|---|---|
| `not-observed` | keine direkte Meldung und kein korreliertes Abfallmuster in der vorhandenen Evidenz |
| `suspected` | reproduzierbarer später Leistungs-/Taktabfall korreliert mit Temperatur, aber ohne eindeutigen Limitgrund |
| `confirmed-thermal` | direkter Thermalgrund oder Erreichen der dokumentierten Grenze mit korreliertem Regelverhalten |
| `confirmed-power-current` | Limit ist Power oder Current, nicht Thermal |
| `unobservable` | Sensorlage reicht nicht für eine Klassifikation |

`suspected` und `confirmed-thermal` invalidieren den Performance-Run. `confirmed-power-current` invalidiert ihn, wenn das Limit nicht Teil des eingefrorenen Zielprofils war. Ein Notebook darf sein normales dauerhaftes OEM-Powerlimit besitzen; dieses muss dann Bestandteil des Profils sein und darf nicht zwischen Runs wechseln.

### 7.4 Erkennungsverfahren

1. Ausgangstemperatur, Idlelast, Power Mode, Lüftermodus und Raumtemperatur soweit verfügbar erfassen.
2. Den festgelegten Warm-up aus R07 ausführen, nicht nach Gefühl verlängern.
3. CPU- und GPU-Temperatur, effektiven Takt, Power und Limitgründe über den gesamten Block protokollieren.
4. Pro Iteration Szenariodauer und Sensorzeitachse korrelieren.
5. Direkte Thermalflags haben Vorrang. Ohne Flag darf ein korrelierter wiederholbarer Abfall nur als `suspected` bezeichnet werden.
6. Nach Abkühlung darf ein Diagnoseblock zur Ursachenprüfung laufen. Er ersetzt oder überschreibt den invaliden Gate-Run nicht.

Auf H1 können AMD Adrenalin und Ryzen Master als dokumentierte Sensorquellen dienen. Overlays bleiben ausgeschaltet. Loggingintervall und Tool-Overhead müssen vor BR-06 charakterisiert werden. Für H2/H3 wird beim Auswählen des Geräts ein äquivalenter OEM- oder Vendorpfad festgelegt.

## 8. Notebook-Netz-, Akku- und Energievertrag

### 8.1 Primärzelle

H2 und H3 laufen primär im Netzbetrieb:

- passendes OEM- oder ausreichend dimensioniertes Ladegerät;
- stabile Powerquelle während des gesamten Runblocks;
- ein eingefrorener Windows Power Mode;
- ein eingefrorener OEM-Leistungs-/Lüftermodus;
- Battery Saver und automatische adaptive Leistungswechsel dokumentiert beziehungsweise für die Primärzelle ausgeschlossen;
- Lid-, Dock- und Displaypfad unverändert.

"Netzbetrieb" allein ist unzureichend. Ein schwaches USB-C-Netzteil, Laden der Batterie unter Last oder ein OEM-Silent-Modus kann ein anderes Leistungsprofil erzeugen.

### 8.2 Akkuzelle

Eine Akkuzelle ist nur erforderlich, wenn der Owner mobiles Spielen als produktrelevanten Supportfall festlegt. Dann gilt:

- eigene Profilbezeichnung, zum Beispiel `H2-BATTERY-BALANCED`;
- festgelegter Windows- und OEM-Akkumodus;
- vorab eingefrorenes Start-Ladeband;
- Akkustand Start und Ende;
- kein Wechsel zu AC im Block;
- Displayhelligkeit und adaptive Helligkeit dokumentiert;
- Temperatur-, Takt- und Powerdaten separat;
- niemals Aggregation mit AC.

Dieser Bericht setzt kein numerisches Ladeband. BR-06 friert es vor der ersten Messung ein. Ein einzelner Akkuwert darf nicht als allgemeine Geräteleistung ausgegeben werden.

## 9. Remote-/Cloud-Hardware und echte lokale GPU

### 9.1 Zulässige Umgebungen

| Umgebung | Korrektheit | Browserkompatibilität | finale Performance | Einschränkung |
|---|---:|---:|---:|---|
| lokales physisches Gerät | ja | ja | ja | bevorzugt für H1-H3 |
| remote bedientes physisches Gerät | ja | ja | bedingt ja | Browser muss lokal headed und sichtbar laufen; Remote-Streaming darf nicht Messmetrik sein |
| dedizierter Bare-Metal-/GPU-Cloudhost | ja | ja | nur als separate Zusatzklasse | keine Batterie, OEM-Thermik oder physische Displayrepräsentation |
| virtuelle dedizierte GPU | ja | ja | informativ | vGPU, Hypervisor, Hostklasse und Exklusivität vollständig binden |
| shared CI / Software-GPU | ja | teilweise | nein | ausschließlich CI-CORRECTNESS |

Ein Cloudhost darf nur dann einen Hx-Namen tragen, wenn er exakt als eigenes `H1-CLOUD-MIRROR` oder ähnliches Profil gekennzeichnet ist. Er ersetzt das kanonische physische Gerät nicht.

### 9.2 Messungen, die echte Ziel-GPU-Hardware benötigen

| Messung | echte GPU nötig? | Begründung |
|---|---:|---|
| Unit-, Schema- und Property-Tests | nein | CPU-/Vertragskorrektheit |
| deterministische Mesherbytes und Coverage | nein | Rendererunabhängig |
| funktionaler Screenshot in gepinnter CI-Umgebung | nein | eigene CI-Baseline, keine Zielrenderingzusage |
| visuelle H1-H3-Baseline | ja | Treiber, Rasterizer und Farbpfad sind umgebungsabhängig |
| WebGL-/WebGPU-Capability | ja | Zieladapter und Treiber müssen real vorhanden sein |
| GPU-Timestamp und GPU-Submit-Vergleich | ja | Softwareadapter ist kein Zielgerät |
| Three/WebGL2 gegen Raw WebGPU | ja | WP12-Entscheidungsmetrik |
| GPU Disjoint, Context Loss, Device Loss | ja | zielpfadspezifisches Verhalten |
| Upload-/Adoption-to-visible | ja | schließt echten Rendererpfad ein |
| Thermal-/Power-/Akkuverhalten | ja, physisches Gerät | Cloud abstrahiert oder verändert diesen Pfad |
| echte Photon-on-screen-Latenz | spezielle lokale Sensorik nötig | wird vom aktuellen Browsermarker nicht behauptet |

CPU-Meshingdauer kann auf CI oder Cloud gemessen werden, ist dort aber nur für dieselbe Runnerzelle aussagekräftig. Für die H1-H3-Produktkalibrierung bleibt der gesamte headed Zielpfad maßgeblich.

## 10. Gerätebeschaffungs- und Leihstrategie

### 10.1 Reihenfolge ohne Neukauf

1. **H1 inventarisieren:** vorhandenen Desktop vollständig erfassen. Kein Neukauf.
2. **Haushalt prüfen:** Windows-11-Laptop oder Mini-PC mit iGPU als H2-Kandidat suchen.
3. **Freunde/Familie prüfen:** Mainstream-Notebook für wiederholbare mehrstündige Leihfenster, bevorzugt mit Adminrechten und ohne Defekt.
4. **Arbeit nur mit Freigabe:** Arbeitsgerät nur nach ausdrücklicher Arbeitgeberfreigabe und ohne Export interner Asset-Tags, Konten oder Sicherheitsdaten. Unternehmensrichtlinien und Endpoint-Software werden dokumentiert und nicht umgangen.
5. **H3 aus realem Alt-/Einstiegsgerät:** unterstütztes, tatsächlich verwendbares Gerät auswählen. Kein unsupported OS und keine künstliche Drosselung.
6. **Remote physisch:** ein Gerät bei Freunden kann lokal messen und nur Rohbundle/Digests übertragen. Remote Desktop darf nicht den Browser-Renderpfad ersetzen.
7. **Cloud zuletzt:** CI und ergänzende Vendor-/Driver-Coverage, nicht als Ersatz für Notebook- oder Minimum-Zielhardware.

### 10.2 Kandidaten-Screening

| Kriterium | Muss für H2 | Muss für H3 |
|---|---:|---:|
| unterstütztes, gepatchtes OS | ja | ja |
| Chrome Stable und Edge Stable installierbar | ja | ja, sofern Edge im Scope |
| aktive echte GPU verifizierbar | ja | ja |
| wiederholbarer Zugriff | ja | ja |
| Power-/Lid-/Dockzustand kontrollierbar | ja | ja |
| Sensorpfad mindestens T1 wünschenswert | ja | ja |
| typischer statt künstlich limitierter Hardwarezustand | ja | ja |
| Einwilligung und Datenschutz geklärt | ja | ja |
| WebGPU hardwarebeschleunigt | für WP10/WP12 ja | nur bei `H3-WEBGPU-MINIMUM` |

### 10.3 Auswahlregel

Die Auswahl optimiert nicht auf die schnellste verfügbare Leihhardware. Vorrang haben:

1. Rollenpassung;
2. langfristige Wiederholbarkeit;
3. kontrollierbare Energie-/Thermalbedingungen;
4. genaue Provenienz;
5. stabile Treiber-/OS-Unterstützung;
6. erst danach Bequemlichkeit.

Ein Gerät, das nur einmal verfügbar ist, kann eine Explorationszelle liefern, aber keine dauerhafte H2-/H3-Baseline.

## 11. Nicht aggregierbare Daten

Nur Runs mit identischem `MeasurementCellKeyV1` werden gemeinsam aggregiert. Folgende Unterschiede erzwingen getrennte Zellen:

- H1, H2, H3 und verschiedene Geräteinstanzen desselben Profils;
- Hardware-Revision, BIOS/UEFI oder relevante Kühler-/Tuningänderung;
- CPU-, RAM-Kanal-, GPU- oder MUX-Pfad;
- OS-Build, Treiber oder Graphics Backend;
- Chrome, Edge, Chrome Beta und unterschiedliche vollständige Browserversionen;
- branded Chrome und Chrome for Testing, sofern die Binaries nicht nachweislich derselben vereinbarten Klasse angehören;
- headed und headless;
- Hardware-, Software- und unbekannter GPU-Pfad;
- lokal physisch, remote physisch, Bare Metal, vGPU und shared CI;
- AC und Battery;
- Windows Power Mode, Power Scheme und OEM-Modus;
- Canvas-Backbuffer, DPR, Browserzoom, Refresh, HDR, VRR oder VSync-Vertrag;
- WebGL2, Three WebGPU und Raw WebGPU;
- Visible, Greedy, Greedy-AO und unterschiedliche Chunkgrößen;
- Cold, Warm-up, Measurement, Stress, Trace und Leak;
- unterschiedlicher Source-SHA, Build-Hash, Fixture-, Scenario-, Protocol- oder Schema-Stand;
- unterschiedliche Featurequalität, Sichtweite, AO-, Kanten- oder Debugkonfiguration;
- Thermal-Klassifikation `not-observed`, `suspected`, `confirmed-*` oder `unobservable`;
- unterschiedliche Browser- oder Workerflags.

Erlaubt ist eine gemeinsame Aggregation mehrerer gültiger Wiederholungen desselben Szenarios innerhalb exakt derselben Zelle. Cross-Profile-Ergebnisse werden nebeneinander berichtet. Es gibt keinen gepoolten "Gesamtscore" über H1-H3.

## 12. Späterer Baseline-Runplan ohne absolute Gates

### 12.1 Voraussetzungen

BR-06 startet erst, wenn:

- WP04 akzeptiert und integriert ist;
- BR-01 bis BR-05 akzeptiert und integriert sind;
- die für das Gate benötigten WP05-WP11-Funktionen auf einer ausdrücklich benannten Baseline vorliegen;
- H1-H3 ausgewählt und Owner-Entscheidungen protokolliert sind;
- Szenarien, Runreihenfolge und Invalidierungsgründe vorab eingefroren sind.

Der Research-SHA dieses Berichts bleibt Provenienz, ist aber nicht automatisch der spätere Ausführungs-SHA.

### 12.2 Reihenfolge je Messzelle

1. Hardware- und Environment-Capture erzeugen.
2. Hardware-/Software-GPU und benötigte Capabilities prüfen.
3. Korrektheits-Preflight ausführen. Bei Fehler keine Performanceauswertung.
4. Thermischen und energetischen Ausgangszustand herstellen.
5. Mindestens zehn Cold-Prozessstarts nach Benchmark Protocol v1 erfassen.
6. Mindestens zehn Warm-up-Iterationen ausführen und die akzeptierte gleitende Stabilitätsregel anwenden; bei fehlender Stabilität spätestens nach der im R07-Protokoll definierten Obergrenze abbrechen.
7. Mindestens dreißig gültige Warm-Measurement-Iterationen je Kandidat erfassen.
8. A/B mit gespeichertem Seed als ABBA/BAAB oder bei mehreren Kandidaten als Latin Square gegenbalancieren.
9. Den definierten 60-Sekunden-Stresslauf separat ausführen.
10. Gatepass ohne Trace, Screenshot und Heap-Profiling beenden und Rohdaten schreiben.
11. Nur bei Bedarf einen getrennten Diagnosepass mit identischer Szenario-ID und `measurementEligible=false` ausführen.
12. Thermal-/Powerklassifikation und vollständige Invalidierungsübersicht erzeugen.
13. Aggregate, hierarchische Konfidenzintervalle und gepaarte Ratios nach BR-04 erzeugen.
14. Ergebnisse unabhängig prüfen lassen, bevor absolute Budgets vorgeschlagen oder aktiviert werden.

Die Iterationszahlen und Phasentrennung stammen aus R07. Dieser C07-Bericht ergänzt keine neuen Performancegrenzen.

### 12.3 Reihenfolge der Geräte

1. CI-CORRECTNESS als Vertrags- und Korrektheitsgate;
2. H1 zur Runner- und Instrumentierungsvalidierung;
3. H2 als primäre Zielkalibrierung;
4. H3 als Minimum-Guardrail;
5. Edge Stable auf exakt H2;
6. Chrome Beta auf exakt H2;
7. optionale Battery-, Pixelstress-, Vendor-Crosscheck- oder Cloud-Zellen.

H1 darf nicht zum Einstellen von Grenzen verwendet werden, bevor H2 und H3 vorliegen. Sonst würden High-End-Werte die Zielhardwaredefinition ersetzen.

## 13. Matrix pro Roadmapgate

| Gate | CI | H1 | H2 | H3 | Edge | Chrome Beta | Entscheidung |
|---|---:|---:|---:|---:|---:|---:|---|
| BR-01 bis BR-04 | Pflicht | Smoke sinnvoll | nicht blockierend | nicht nötig | nein | nein | Infrastruktur, keine Hardwarekalibrierung |
| Start WP05 | Pflicht | ausreichend für lokale Entwicklung | Kandidat soll gesichert sein | nicht nötig | nein | nein | kein Neukaufblocker |
| WP05 Performance-Abnahme | Pflicht | Pflicht | Pflicht | informativ | funktional sinnvoll | informativ | Mainstreamaussage erst mit H2 |
| WP08 Stress/Edits | Pflicht | Pflicht | Pflicht | stark empfohlen | funktional | informativ | H3-Lücke macht Minimumaussage vorläufig |
| WP09 32³/64³-Entscheid | Pflicht | Pflicht | Pflicht | Pflicht für produktweite Entscheidung | nicht entscheidend | nicht entscheidend | ohne H3 nur vorläufige H1/H2-Entscheidung |
| WP10/WP11 WebGPU | Pflicht für Korrektheit | reale GPU Pflicht | reale iGPU Pflicht | Capability-/Fallbackpflicht | funktional Pflicht, falls Edge im Scope | Frühwarnung | keine Software-GPU-Rangfolge |
| BR-06 Kalibrierung | Pflicht | Pflicht | Pflicht | Pflicht | Funktionszelle | Informationszelle | Profile und Budgets versionieren |
| WP12 Technologieentscheid | Pflicht | Pflicht | Pflicht | Pflicht als Guardrail | Funktionsgate | Frühwarnung | unabhängiger Review vor Entscheidung |

### 13.1 Prioritäten vor WP05, WP09 und WP12

1. **Vor WP05-Start:** kein Hardwarekauf erforderlich. H1 plus CI reichen zum Entwickeln und Prüfen der Korrektheit. Parallel muss ein H2-Kandidat inventarisiert werden.
2. **Vor WP05-Performance-Abnahme:** H2 muss real verfügbar sein. Sonst ist nur eine H1-Entwicklungscharakterisierung zulässig.
3. **Vor WP09:** H1 und H2 sind zwingend. H3 muss ausgewählt sein, wenn der Chunkentscheid als produktweite Entscheidung gelten soll. Ohne H3 bleibt er ausdrücklich vorläufig.
4. **Vor WP12:** H1, H2 und H3 müssen vollständig kalibriert sein. Edge Stable und Chrome Beta benötigen keine zusätzliche Hardware, sondern laufen als Browseroverlays auf H2.
5. **Cloud:** zuerst für CI und ergänzende Kompatibilität nutzen. Nicht als Ersatzgerät kaufen oder mieten, bevor klar ist, welche lokale Lücke überhaupt besteht.

## 14. Offene Owner-Entscheidungen

| ID | Entscheidung | Empfohlener Default | Folge bei offenem Punkt |
|---|---|---|---|
| O-01 | Welches konkrete Gerät wird H2? | Haushalt/Freunde inventarisieren; genau ein Intel- oder AMD-iGPU-Gerät auswählen | keine Mainstreamkalibrierung |
| O-02 | Muss H3 WebGPU unterstützen? | `H3-WEBGL2-FALLBACK`, solange WebGPU-only nicht beschlossen ist | H3-Gerätekategorie bleibt unbestimmt |
| O-03 | Welches konkrete Gerät wird H3? | schwächstes bewusst unterstütztes, gepatchtes reales Gerät | keine Minimum-Guardrail |
| O-04 | Kanonisch 1920 x 1080, DPR 1, 60 Hz? | akzeptieren; zusätzliche Pixel-/High-Refresh-Zellen separat | Displayvertrag bleibt offen |
| O-05 | Ist Akkubetrieb produktrelevant? | zunächst informativ, nicht Release-Gate | keine Akkuzelle nötig |
| O-06 | Ziel-OS oder Zielbrowser außerhalb Windows 11, Chrome und Edge? | v1 auf Windows 11, Chrome Stable und Edge Stable begrenzen; Beta nur Frühwarnung | weitere OS-/Browserhardware kann nötig werden |
| O-07 | Dürfen Arbeitsgeräte verwendet werden? | nur mit ausdrücklicher Arbeitgeberfreigabe | Arbeit aus Kandidatenpool entfernen |
| O-08 | Darf dedizierte Cloud-GPU ergänzen? | ja, aber nur als separat benannte Zusatzklasse | keine Auswirkung auf H1-H3 |
| O-09 | Wo bleiben Performance-Evidence-Bundles? | CI-Artefakt/Attestation primär; Commit nur nach separater Governanceentscheidung | Speicher- und Reviewworkflow offen |
| O-10 | Welcher Thermal-Sensorpfad gilt auf H2/H3? | Vendor/OEM-Tool mindestens T1, T2 wenn verfügbar | reduzierte Evidenz oder keine finale Performanceklassifikation |
| O-11 | Soll ein zweites H2 anderer GPU-Vendorfamilie ergänzt werden? | erst nach kanonischem H2 und nur informativ | kein Blocker für v1 |

Bis O-01 bis O-04 und O-10 beantwortet sind, bleibt der Gesamtstatus `REQUIRES_OWNER_DECISION`.

## 15. Review- und Akzeptanzkriterien für diesen Vertrag

Der Hardwarevertrag kann für spätere Implementierung akzeptiert werden, wenn:

- [ ] jede der zwölf Aufgaben aus C07 durch einen Abschnitt abgedeckt ist;
- [ ] H1 ausdrücklich nur Entwicklungsbaseline ist;
- [ ] H2 und H3 jeweils genau ein Geräteexemplar binden;
- [ ] CI, Edge und Chrome Beta nicht als Hardwaredurchschnitt behandelt werden;
- [ ] Hardware-/Software-GPU fail-closed klassifiziert wird;
- [ ] AC/Battery, Browser, Treiber, Display und Thermal nicht aggregiert werden;
- [ ] keine absolute Performancegrenze aus diesem Bericht übernommen wird;
- [ ] BR-06 erst auf einer später akzeptierten Baseline ausgeführt wird;
- [ ] fremde Geräte ohne Seriennummern und nur mit Zustimmung dokumentiert werden;
- [ ] ein unabhängiger Reviewer Rohdaten, Zellschlüssel und Invalidierungen prüft.

## 16. Quellenregister

### Projektquellen

- `WELTRAUM_PROJECT_INSTRUCTIONS_ADDENDUM(1).md`
- `WELTRAUM_PROJECT_MEMORY(1).md`
- `WELTRAUM_RESEARCH_REGISTER(1).md`
- `WELTRAUM_RESEARCH_DECISION_LOG_2026-08-12.md`
- `WELTRAUM_RESEARCH_SYNTHESIS_2026-08-12.md`
- `07_benchmark_test_methodology_audit_report(1).md`
- `wp05_worker_scheduler_abschlussbericht(1).md`
- `03_webgpu_engine_bakeoff_abschlussbericht(2).md`

### Externe Primärquellen

- [Playwright: Browsers und Channels](https://playwright.dev/docs/browsers)
- [Playwright: Visual Comparisons](https://playwright.dev/docs/test-snapshots)
- [Chrome for Testing](https://developer.chrome.com/docs/automation-and-testing/chrome-for-testing)
- [Chrome DevTools Protocol: SystemInfo](https://chromedevtools.github.io/devtools-protocol/tot/SystemInfo/)
- [Chrome: WebGPU Troubleshooting](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips)
- [W3C WebGPU](https://www.w3.org/TR/webgpu/)
- [Khronos: EXT_disjoint_timer_query_webgl2](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/)
- [Microsoft: Windows Power Mode](https://support.microsoft.com/en-us/windows/change-the-power-mode-for-your-windows-pc-c2aff038-22c9-f46d-5ca0-78696fdf2de8)
- [AMD: Adrenalin Performance Metrics](https://www.amd.com/en/resources/support-articles/faqs/DH3-038.html)
- [AMD: Ryzen Master](https://www.amd.com/en/products/software/ryzen-master.html)
- [AMD: Precision Boost 2](https://www.amd.com/en/resources/support-articles/faqs/CPU-PB2.html)

## 17. Copy-and-paste-Handoff-Prompt für BR-06

```text
Titel: BR-06 - H1-H3-Kalibrierung, versionierte Gates und unabhängige Reviewevidence

Arbeitsmodus:
Du bist der spätere lokale Write- und Calibration-Agent für
BenjaminHornung/hestia-voxel-kernel-lab. Beginne erst, wenn der Owner BASE,
H1_DEVICE, H2_DEVICE, H3_DEVICE und die unten genannten Entscheidungen
explizit eingesetzt hat.

Verbindliche Eingaben:
- BASE=<letzter akzeptierter und integrierter SHA nach den erforderlichen WP-/BR-Paketen>
- H1_DEVICE=<pseudonyme ausgewählte Geräte-ID>
- H2_DEVICE=<pseudonyme ausgewählte Geräte-ID>
- H3_DEVICE=<pseudonyme ausgewählte Geräte-ID>
- H3_MODE=<H3-WEBGL2-FALLBACK|H3-WEBGPU-MINIMUM>
- CANONICAL_DISPLAY=<Owner-freigegebener Canvas-/DPR-/Refresh-Vertrag>
- BATTERY_SCOPE=<out-of-scope|informational|required>
- BROWSER_SCOPE=<Owner-freigegebene Stable-Browser>
- EVIDENCE_POLICY=<Owner-freigegebene Ablage-/Attestationregel>
- THERMAL_SOURCES=<freigegebene Sensorquellen je Gerät>

Verbindliche Dokumente:
1. C07-Abschlussbericht "H1-H3-Hardwareprofile und Kalibrierungsplan"
2. Benchmark Protocol v1 und alle akzeptierten BR-01- bis BR-05-Verträge
3. aktuelles WELTRAUM_PROJECT_MEMORY und Decision Log
4. aktuelle Repositoryregeln und AGENTS.md

Harte Startbedingungen:
1. Verifiziere Remote-Truth und BASE. Starte nicht von
   d95992df05952ac4be6221ca1809c1c9e3c0ac9d, wenn die akzeptierte BR-06-Basis
   inzwischen weiter ist.
2. WP04 und BR-01 bis BR-05 müssen akzeptiert und integriert sein. Die für die
   zu kalibrierenden WP05-WP11-Szenarien benötigten Implementierungen müssen auf
   BASE vorliegen.
3. Alle drei Geräteprofile müssen selectionStatus=selected besitzen.
4. Stoppe mit einem klaren Blockerbericht, wenn H2, H3, H3_MODE,
   CANONICAL_DISPLAY oder THERMAL_SOURCES fehlen.
5. Maximal ein Write-Agent im Repository. Arbeite in einem isolierten Worktree
   auf agent/br-06-calibrated-gates. Kein Merge.

Ziel:
Implementiere ausschließlich BR-06 auf Grundlage der vorhandenen Contracts:
- versionierte HardwareProfileV1-Dateien für H1-H3 ohne Seriennummern/PII;
- EnvironmentCaptureV1 für OS, CPU, RAM, GPU, Treiber, Browser, Flags,
  Graphics Backend, Display, Power, Thermal, Fokus und GPU-Hardwareklasse;
- fail-closed MeasurementCellKeyV1 und Nichtaggregationsprüfungen;
- reproduzierbare Runpläne für H1-H3, Edge Stable auf H2 und Chrome Beta auf H2;
- Kalibrierungsreport mit append-only Rohdaten, Invalidierungen, CIs und
  vollständiger Provenienz;
- versionierte Vorschläge für WP05-, WP08-, WP09- und WP12-Gates;
- unabhängige Reviewercheckliste.

Messregeln:
- Korrektheit vor Performance.
- Headed, sichtbar, fokussiert und verifizierte Hardware-GPU für H1-H3.
- CI-/Software-GPU niemals als Zielhardwareperformance ausgeben.
- Cold, Warm-up, Measurement, Stress und Trace getrennt halten.
- Mindestens die im akzeptierten Benchmark Protocol v1 festgelegten
  Wiederholungen verwenden.
- A/B-Reihenfolge mit gespeichertem Seed gegenbalancieren.
- Keine gültigen Ausreißer löschen und keine automatischen Performance-Retries.
- AC/Battery, Chrome/Edge/Beta, Browserbuilds, Treiber, OS, HardwareRevision,
  DPR/Refresh, headed/headless und Hardware/Software-GPU nie aggregieren.
- Temperatur allein nicht als Throttlingbeweis ausgeben. Sensorquelle,
  Zeitverlauf, Takt/Power und Limitgründe binden.
- Traces, Screenshots, DevTools und Heap-Snapshots nur in separaten
  measurementEligible=false-Diagnoseruns.
- Keine absolute Schwelle aktivieren, bevor sie aus den akzeptierten
  Baselines abgeleitet, produktseitig begründet und unabhängig reviewed wurde.

Pflichtszenarien:
- alle von BR-01 bis BR-05 versionierten Korrektheits- und Benchmark-Szenarien;
- WP05 Scheduler/Liveness auf H1 und H2;
- WP08 Edit-/Stress auf H1, H2 und H3;
- WP09 32^3 gegen 64^3 auf H1, H2 und H3;
- WP10/WP11 beziehungsweise WP12 Backendparität auf realer H1-/H2-GPU und
  entsprechend H3_MODE;
- Edge Stable Funktionszelle auf H2;
- Chrome Beta Informationszelle auf H2.

Abnahme:
- jedes Rawfile validiert gegen das akzeptierte Schema;
- jede Aggregatezahl reproduzierbar aus Rohdaten;
- vollständige Liste gültiger, invalidierter und fehlgeschlagener Runs;
- Hardware-GPU-Klasse für jede Performancezelle bewiesen;
- keine vermischten MeasurementCellKeys;
- Thermal-/Powerklassifikation je Runblock;
- keine erfundenen oder aus fremden Benchmarks übernommenen Grenzen;
- Reviewer kann Source, Build, Gerät, Browser, Treiber, Display, Power,
  Szenario und Aggregator lückenlos zurückverfolgen;
- Commit und Push genau eines BR-06-Changesets, danach stoppen;
- kein Merge, kein WP12-Entscheid und kein Beginn eines Folgepakets.

Abgabe:
1. Branch und finaler Commit-SHA;
2. geänderte Dateien;
3. pro Gerät und Browserzelle vollständiger Environment-Capture;
4. Rohdaten-/Aggregate-/Manifest-Digests;
5. Kalibrierungsreport mit Fakt, Inferenz und Unknown;
6. vorgeschlagene, noch nicht selbst freigegebene Gateversion;
7. offene Findings und Stop-Gates;
8. Copy-and-paste-Prompt für den unabhängigen BR-06-Review.
```
