export { GEAR, BUILT_IN, matchGear, type GearEntry } from "./registry";
export { PARSERS, parseLoadout, secretFindings, jsonConfigParser, codexTomlParser, listParser } from "./parsers";
export { analyzeLoadout, type AnalyzedGear, type AnalyzeOptions, type LoadoutReport } from "./analyze";
export { TREND, PROVEN_CAPABILITIES, trendCheck, type Trend, type TrendReport } from "./trend";
export { sanitizeLabel, toScanPayload, parseScanPayload, type ScanPayload } from "./scan-payload";
