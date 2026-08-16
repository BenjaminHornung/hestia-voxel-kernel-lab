export const BENCHMARK_JCS_GOLDENS_V1 = {
  sorted: '{"a":"ä","n":1e-7,"z":0}',
  unicodeComposed: '{"composed":"é","decomposed":"é"}',
  duplicateRejected: '{"a":1,"a":2}',
  emptyObject: '{}',
} as const;
