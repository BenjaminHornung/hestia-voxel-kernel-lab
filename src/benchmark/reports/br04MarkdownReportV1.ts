/**
 * BR04 markdown report (v1): pure projection of a BenchmarkAggregateV1
 * into a BenchmarkMarkdownReportModelV1, plus a pure renderer.
 *
 * The renderer never recomputes statistics: every number is formatted
 * from an aggregate value referenced by an aggregate JSON pointer
 * (report section 13.2). Rounding is display only (toPrecision(6)).
 * decision stays null; the closing line is always
 * `No winner is declared by BR-04.`
 *
 * When the aggregate is built from synthetic fixtures
 * (performanceClaimEligibility ineligible-synthetic-fixture), the report
 * carries an explicit refusal notice: numeric values are shown for
 * contract verification only and are not performance claims.
 */
import { sha256OfCanonicalV1, formatSignificantV1 } from '../aggregate/br04StatisticsV1';
import type {
  Br04AllowedChartSpecV1,
  Br04BenchmarkAggregateV1,
  Br04BootstrapIntervalV1,
  Br04MarkdownReportModelV1,
  Br04PerformanceClaimEligibilityV1,
  Br04QuantileResultV1,
  Br04ReportSectionV1,
} from '../aggregate/br04ContractV1';

function sectionV1(
  heading: string,
  rows: readonly Readonly<Record<string, string>>[],
  aggregateJsonPointers: readonly string[],
): Br04ReportSectionV1 {
  return { heading, rows, aggregateJsonPointers };
}

function quantileCellV1(quantile: Br04QuantileResultV1): string {
  if (quantile.status !== 'ok' || quantile.value === null) return quantile.status;
  return formatSignificantV1(quantile.value);
}

function intervalCellV1(interval: Br04BootstrapIntervalV1): string {
  if (interval.status !== 'ok' || interval.lower === null || interval.upper === null) {
    return interval.status;
  }
  return `[${formatSignificantV1(interval.lower)}, ${formatSignificantV1(interval.upper)}]`;
}

export function buildReportModelV1(aggregate: Br04BenchmarkAggregateV1): Br04MarkdownReportModelV1 {
  const eligibility: Br04PerformanceClaimEligibilityV1 =
    aggregate.inputProvenance.performanceClaimEligibility;
  const provenanceRows: Record<string, string>[] = [
    {
      item: 'accepted BR03 SHA',
      value: aggregate.acceptedBr03Sha,
      pointer: '/acceptedBr03Sha',
    },
    {
      item: 'run plan digest',
      value: aggregate.runPlanDigest,
      pointer: '/runPlanDigest',
    },
    {
      item: 'metric registry digest',
      value: aggregate.metricRegistryDigest,
      pointer: '/metricRegistryDigest',
    },
    {
      item: 'bootstrap policy digest',
      value: aggregate.bootstrapPolicyDigest,
      pointer: '/bootstrapPolicyDigest',
    },
    {
      item: 'aggregator source digest',
      value: aggregate.aggregatorSourceDigest,
      pointer: '/aggregatorSourceDigest',
    },
    {
      item: 'aggregate digest',
      value: aggregate.aggregateDigest,
      pointer: '/aggregateDigest',
    },
    {
      item: 'performance claim eligibility',
      value: eligibility,
      pointer: '/inputProvenance/performanceClaimEligibility',
    },
  ];
  const environmentRows: Record<string, string>[] = [];
  const summaryRows: Record<string, string>[] = [];
  const comparisonRows: Record<string, string>[] = [];
  const maximaRows: Record<string, string>[] = [];
  const chartSpecs: Br04AllowedChartSpecV1[] = [];
  aggregate.environmentCells.forEach((cell, cellIndex) => {
    environmentRows.push({
      environment: cell.environmentCellId,
      phase: cell.phase,
      candidate: cell.candidateId,
      pointer: `/environmentCells/${cellIndex}/environmentCellId`,
    });
    cell.metricCells.forEach((metricCell, metricIndex) => {
      const base = `/environmentCells/${cellIndex}/metricCells/${metricIndex}`;
      const pooled = metricCell.descriptivePooledQuantiles;
      summaryRows.push({
        cell: `${cell.environmentCellId}/${cell.phase}/${cell.candidateId}`,
        metric: metricCell.metricRef,
        processes: String(metricCell.nProcesses),
        runs: String(metricCell.nRuns),
        iterations: String(metricCell.nIterations),
        events: String(metricCell.nEvents),
        qualification: metricCell.populationQualification,
        p50: quantileCellV1(pooled[0] as Br04QuantileResultV1),
        p95: quantileCellV1(pooled[1] as Br04QuantileResultV1),
        p99: quantileCellV1(pooled[2] as Br04QuantileResultV1),
        point: metricCell.cellPointEstimate === null ? 'null' : formatSignificantV1(metricCell.cellPointEstimate),
        ci95: intervalCellV1(metricCell.cellInterval),
        pointer: `${base}/cellPointEstimate`,
      });
      maximaRows.push({
        cell: `${cell.environmentCellId}/${cell.phase}/${cell.candidateId}`,
        metric: metricCell.metricRef,
        maximum: metricCell.maximum === null ? 'null' : formatSignificantV1(metricCell.maximum),
        pointer: `${base}/maximum`,
      });
      chartSpecs.push(
        {
          chartId: `ecdf-${cellIndex}-${metricIndex}`,
          kind: 'ecdf',
          sourceJsonPointers: [`${base}/descriptivePooledQuantiles`, `${base}/maximum`],
          includesAllValidPoints: true, showsInvalidCount: true,
          truncatedAxis: false, declaresPhase: true,
        },
        {
          chartId: `run-dotplot-${cellIndex}-${metricIndex}`,
          kind: 'run-dotplot',
          sourceJsonPointers: [`${base}/perRunSummaries`],
          includesAllValidPoints: true, showsInvalidCount: true,
          truncatedAxis: false, declaresPhase: true,
        },
      );
    });
  });
  aggregate.pairedComparisons.forEach((comparison, comparisonIndex) => {
    const base = `/pairedComparisons/${comparisonIndex}`;
    comparisonRows.push({
      comparison: comparison.comparisonId,
      planned: String(comparison.pairs.planned),
      complete: String(comparison.pairs.complete),
      incomplete: String(comparison.pairs.incomplete),
      difference: comparison.differencePointEstimate === null ? 'null' : formatSignificantV1(comparison.differencePointEstimate),
      differenceCI: intervalCellV1(comparison.differenceInterval),
      ratio: comparison.ratioPointEstimate === null ? 'null' : formatSignificantV1(comparison.ratioPointEstimate),
      ratioCI: intervalCellV1(comparison.ratioInterval),
      pointRelation: comparison.practicalEffect.pointRelation,
      intervalRelation: comparison.practicalEffect.intervalRelation,
      ciToOne: comparison.practicalEffect.ciRelationToOne,
      decision: 'null',
      pointer: `${base}/ratioPointEstimate`,
    });
    chartSpecs.push(
      {
        chartId: `paired-ratio-${comparisonIndex}`,
        kind: 'paired-ratio',
        sourceJsonPointers: [`${base}/pairValues`, `${base}/ratioPointEstimate`],
        includesAllValidPoints: true, showsInvalidCount: true,
        truncatedAxis: false, declaresPhase: true,
      },
      {
        chartId: `ci-forest-${comparisonIndex}`,
        kind: 'ci-forest',
        sourceJsonPointers: [`${base}/differenceInterval`, `${base}/ratioInterval`],
        includesAllValidPoints: true, showsInvalidCount: true,
        truncatedAxis: false, declaresPhase: true,
      },
    );
  });
  const ledgerRows = aggregate.validation.runLedger.map((row, index) => ({
    slot: row.slotId,
    run: row.runId ?? 'missing',
    base: row.baseDisposition,
    pair: row.pairDisposition,
    reasons: row.reasonCodes.join(';'),
    pointer: `/validation/runLedger/${index}/baseDisposition`,
  }));
  const capabilityRows = aggregate.capabilityCoverage.map((entry, index) => ({
    metric: entry.metricRef,
    environment: entry.environmentCellId,
    candidate: entry.candidateId,
    status: entry.status,
    planned: String(entry.plannedRuns),
    observed: String(entry.observedRuns),
    supported: String(entry.supportedRuns),
    unsupported: String(entry.unsupportedRuns),
    errored: String(entry.erroredRuns),
    pointer: `/capabilityCoverage/${index}/status`,
  }));
  const invalidationRows: Record<string, string>[] = aggregate.invalidRuns.entries.map((entry, index) => ({
    slot: entry.slotId,
    run: entry.runId ?? 'missing',
    base: entry.baseDisposition,
    scope: entry.scope,
    reasons: entry.reasonCodes.join(';'),
    pointer: `/invalidRuns/entries/${index}/baseDisposition`,
  }));
  invalidationRows.push(
    ...aggregate.invalidRuns.missingSlots.map((slotId, offset) => ({
      slot: slotId,
      run: 'missing',
      base: 'missing-slot',
      scope: 'run',
      reasons: 'missing-slot',
      pointer: `/invalidRuns/missingSlots/${offset}`,
    })),
  );
  const factRows = aggregate.facts.map((fact, index) => ({
    fact, pointer: `/facts/${index}`,
  }));
  const inferenceRows = aggregate.inferences.map((inference, index) => ({
    inference, pointer: `/inferences/${index}`,
  }));
  const unknownRows = aggregate.unknowns.map((unknown, index) => ({
    unknown, pointer: `/unknowns/${index}`,
  }));
  const claimRows = aggregate.claimIndex.map((entry, index) => ({
    claim: entry.claimId,
    class: entry.class,
    pointers: entry.aggregateJsonPointers.join(';'),
    pointer: `/claimIndex/${index}/claimId`,
  }));
  const withPointers = (
    rows: readonly Record<string, string>[],
  ): { rows: readonly Readonly<Record<string, string>>[]; pointers: string[] } => {
    const pointers: string[] = [];
    const stripped = rows.map((row) => {
      const { pointer, ...rest } = row;
      if (pointer !== undefined) pointers.push(pointer);
      return rest;
    });
    return { rows: stripped, pointers };
  };
  const provenance = withPointers(provenanceRows);
  const environment = withPointers(environmentRows);
  const ledgerSection = withPointers(ledgerRows);
  const summary = withPointers(summaryRows);
  const comparison = withPointers(comparisonRows);
  const capability = withPointers(capabilityRows);
  const invalidation = withPointers(invalidationRows);
  const maxima = withPointers(maximaRows);
  const facts = withPointers(factRows);
  const inferences = withPointers(inferenceRows);
  const unknownsSection = withPointers(unknownRows);
  const claimsSection = withPointers(claimRows);
  const merge = (
    heading: string,
    parts: { rows: readonly Readonly<Record<string, string>>[]; pointers: string[] }[],
  ): Br04ReportSectionV1 => sectionV1(
    heading,
    parts.flatMap((part) => part.rows),
    [...new Set(parts.flatMap((part) => part.pointers))].sort(),
  );
  const modelBody = {
    schemaVersion: 1 as const,
    contractVersion: 'br04-markdown-report-model-v1' as const,
    aggregateDigest: aggregate.aggregateDigest,
    title: 'BR04 benchmark aggregate report',
    reportAsOfUtc: aggregate.reportAsOfUtc,
    statusBanner: 'neutral-evidence-no-winner' as const,
    performanceClaimEligibility: eligibility,
    provenanceSection: merge('Provenance', [provenance]),
    environmentSection: merge('Environment cells', [environment]),
    runLedgerSection: merge('Run ledger', [ledgerSection]),
    summarySection: merge('Summaries and maxima', [summary, maxima]),
    comparisonSection: merge('Comparisons', [comparison]),
    capabilitySection: merge('Capability coverage', [capability]),
    invalidationSection: merge('Invalidation', [invalidation]),
    chartSpecifications: chartSpecs,
    factInferenceUnknownSection: merge('Facts, inferences, unknowns', [facts, inferences, unknownsSection, claimsSection]),
    claimIndex: aggregate.claimIndex,
  };
  return { ...modelBody, reportModelDigest: sha256OfCanonicalV1(modelBody) };
}

const REPORT_HEADINGS_V1 = [
  'Scope, contract versions and claim class',
  'Source, build, fixture and run plan provenance',
  'Environment cells',
  'Complete run ledger',
  'Capability coverage',
  'Per-run and pooled descriptive summaries',
  'Hierarchical bootstrap confidence intervals',
  'Paired differences and ratios',
  'Practical effect bands separated from interval location',
  'Maxima',
  'Infrastructure-invalid, capability-unsupported, candidate-failure, provenance mismatch, source dirty and trace-only',
  'Missing slots and incomplete pairs',
  'Raw run, bundle, registry, aggregator and aggregate digests',
  'Facts, inference, unknown',
  'Neutral closing line',
] as const;

export function reportHeadingsV1(): readonly string[] {
  return REPORT_HEADINGS_V1;
}

function escapeCellV1(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function renderTableV1(rows: readonly Readonly<Record<string, string>>[]): string[] {
  if (rows.length === 0) return ['(none)'];
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }
  const lines = [
    `| ${columns.map(escapeCellV1).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
  ];
  for (const row of rows) {
    lines.push(`| ${columns.map((column) => escapeCellV1(row[column] ?? '')).join(' | ')} |`);
  }
  return lines;
}

/** Pure markdown renderer: formats model values, computes no statistics. */
export function renderMarkdownReportV1(model: Br04MarkdownReportModelV1): string {
  const lines: string[] = [
    `# ${model.title}`,
    '',
    `Status: ${model.statusBanner}`,
    `As of: ${model.reportAsOfUtc}`,
    `Aggregate: ${model.aggregateDigest}`,
    '',
  ];
  if (model.performanceClaimEligibility === 'ineligible-synthetic-fixture') {
    lines.push(
      '> Synthetic fixture report: numeric values verify the aggregation contract only.',
      '> All numeric performance claims are refused for synthetic fixtures.',
      '',
    );
  }
  const [
    scopeHeading, provenanceHeading, environmentHeading, ledgerHeading, capabilityHeading,
    summaryHeading, intervalHeading, comparisonHeading, effectHeading, maximaHeading,
    invalidationHeading, missingHeading, digestHeading, factHeading, closingHeading,
  ] = REPORT_HEADINGS_V1;
  lines.push(`## ${scopeHeading}`, '', `Eligibility: ${model.performanceClaimEligibility}`, '');
  lines.push(`## ${provenanceHeading}`, '', ...renderTableV1(model.provenanceSection.rows), '');
  lines.push(`## ${environmentHeading}`, '', ...renderTableV1(model.environmentSection.rows), '');
  lines.push(`## ${ledgerHeading}`, '', ...renderTableV1(model.runLedgerSection.rows), '');
  lines.push(`## ${capabilityHeading}`, '', ...renderTableV1(model.capabilitySection.rows), '');
  lines.push(`## ${summaryHeading}`, '', ...renderTableV1(model.summarySection.rows), '');
  lines.push(`## ${intervalHeading}`, '', ...renderTableV1(model.summarySection.rows), '');
  lines.push(`## ${comparisonHeading}`, '', ...renderTableV1(model.comparisonSection.rows), '');
  lines.push(`## ${effectHeading}`, '', ...renderTableV1(model.comparisonSection.rows), '');
  lines.push(`## ${maximaHeading}`, '', ...renderTableV1(model.summarySection.rows), '');
  lines.push(`## ${invalidationHeading}`, '', ...renderTableV1(model.invalidationSection.rows), '');
  lines.push(`## ${missingHeading}`, '', ...renderTableV1(model.invalidationSection.rows), '');
  lines.push(`## ${digestHeading}`, '', ...renderTableV1(model.provenanceSection.rows), '');
  lines.push(`## ${factHeading}`, '', ...renderTableV1(model.factInferenceUnknownSection.rows), '');
  lines.push(`## ${closingHeading}`, '', 'No winner is declared by BR-04.', '');
  return lines.join('\n');
}
