# Third-party AJV

BR01 uses `ajv` exactly at version `8.20.0` as a development-only dependency. The package is MIT licensed. The lockfile contains AJV and its resolved transitive dependencies only: `fast-deep-equal`, `fast-uri`, `json-schema-traverse`, and `require-from-string`.

Tests use `Ajv2020` with `strict: true` and `allErrors: true`; data mutation, coercion, defaults, property removal, remote loading, formats, CLI, and standalone generation are disabled. AJV is imported only from `tests/unit/benchmark/**`. No runtime bundle imports or contains AJV, and no performance claim depends on AJV.
