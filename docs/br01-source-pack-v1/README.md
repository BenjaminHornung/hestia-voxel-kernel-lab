# BR01 Commit-bound Source Pack v1

Dieses Verzeichnis ist ein ausschließlich dokumentarisches und provenienzbezogenes Quellenpaket für den gestoppten BR01-Agenten. Es bindet die aufgeführten Quellen durch Dateigröße, SHA-256 und Git-Blob-SHA an einen prüfbaren Commit.

## Verbindliche Basis

- Repository: `BenjaminHornung/hestia-voxel-kernel-lab`
- Source-Pack-Branch: `docs/br01-source-pack-v1`
- Source-Pack-Basis und C08-Dokumentationsstand: `377979a27f5ca8482a3bf534b9307653417b43bd`
- Produktive WP04-Integrationsbasis für BR01: `c64aeef1f51dd0ed2d8431411cf3ba1e84195b9d`

Die Rangfolge und Konfliktregeln stehen in [SOURCE_PRECEDENCE.md](SOURCE_PRECEDENCE.md). Die maschinenlesbare Bindung der Quellen steht in [SOURCE_MANIFEST.json](SOURCE_MANIFEST.json).

## Zulässige Verwendung

Der BR01-Agent darf dieses Paket ausschließlich schreibgeschützt konsumieren. Dieses Paket darf niemals in den BR01-Produktbranch `agent/br-01-benchmark-contracts-provenance` gemergt oder per Cherry-pick übernommen werden. BR01 bleibt direkt von `c64aeef1f51dd0ed2d8431411cf3ba1e84195b9d` abgezweigt.

Das Paket trifft keine Aussage über einen Implementierungsstatus und autorisiert weder BR02, BR03, BR04, WP05 noch Produkt- oder Editor-Arbeit. Es enthält keine Produktimplementierung, keine Lockfile-Änderung, keine Goldens und keine Evidenzartefakte.
