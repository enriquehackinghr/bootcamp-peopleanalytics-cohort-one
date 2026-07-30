/**
 * Shared contract between Developer 1 (API / semantic layer) and Developer 2 (UI).
 * Changing this file obligates both developers to re-read it before their next task.
 */

// ---------------------------------------------------------------------------
// Filter context
// ---------------------------------------------------------------------------

export type ComparisonMode = 'none' | 'prior_period' | 'same_period_last_year'

export type PeriodGrain = 'month' | 'quarter' | 'year' | 'ttm'

export interface PeriodSelection {
  grain: PeriodGrain
  /** Inclusive end of the reporting window; null = derive from data_loads / facts */
  asOfDate: string | null
}

export interface FilterContext {
  functions: string[]
  locations: string[]
  levelBands: string[]
  tenureBands: string[]
  period: PeriodSelection
  comparison: ComparisonMode
  /** Cross-filter selection from a mark click (entity key + value) */
  crossFilter: { dimension: string; value: string } | null
  /** Drill path into a declared hierarchy */
  drill: { hierarchy: HierarchyId; path: string[] } | null
}

export const EMPTY_FILTER_CONTEXT: FilterContext = {
  functions: [],
  locations: [],
  levelBands: [],
  tenureBands: [],
  period: { grain: 'ttm', asOfDate: null },
  comparison: 'prior_period',
  crossFilter: null,
  drill: null,
}

export type HierarchyId = 'org' | 'geography' | 'time'

export interface HierarchyDeclaration {
  id: HierarchyId
  label: string
  levels: string[]
}

export const HIERARCHIES: HierarchyDeclaration[] = [
  {
    id: 'org',
    label: 'Organization',
    levels: ['function', 'job_family', 'career_level', 'employee'],
  },
  {
    id: 'geography',
    label: 'Geography',
    levels: ['region', 'country', 'office', 'pay_zone'],
  },
  {
    id: 'time',
    label: 'Time',
    levels: ['year', 'quarter', 'month'],
  },
]

/** Minimum cell size for demographic / manager cuts (locked for v0.1). */
export const MIN_CELL_SIZE = 5

// ---------------------------------------------------------------------------
// Metric polarity & KPI tiles
// ---------------------------------------------------------------------------

export type MetricPolarity = 'higher_is_better' | 'lower_is_better' | 'neutral'

export interface MetricDelta {
  absolute: number
  /** Percentage-point change for rates; percent change for counts when meaningful */
  relative: number | null
  direction: 'up' | 'down' | 'flat'
  polarity: MetricPolarity
}

export interface KpiTile {
  id: string
  label: string
  value: number
  format: 'count' | 'rate' | 'ratio' | 'score' | 'days'
  delta: MetricDelta | null
  methodologyId: string
  unit?: string
}

export interface DataSourceRef {
  fileName: string
  loadedAt: string
  tables: string[]
}

export interface DataFreshness {
  lastLoadedAt: string | null
  asOfDate: string | null
  sourceSummary: string | null
  /** Latest upload that contributed each set of tables (newest first). */
  sources: DataSourceRef[]
}

// ---------------------------------------------------------------------------
// Chart / visual payloads
// ---------------------------------------------------------------------------

export type ChartForm =
  | 'line'
  | 'horizontal_bar'
  | 'stacked_bar'
  | 'histogram'
  | 'scatter'
  | 'stage_bars'
  | 'heatmap'
  | 'stat'

export interface ChartSeriesPoint {
  x: string | number
  y: number
  series?: string
  label?: string
  meta?: Record<string, string | number | null>
}

export interface ReferenceLine {
  value: number
  label: string
}

export interface BenchmarkBand {
  min: number
  max: number
  label: string
}

export interface ChartPayload {
  id: string
  title: string
  form: ChartForm
  dimension: string
  measure: string
  points: ChartSeriesPoint[]
  seriesKeys?: string[]
  referenceLines?: ReferenceLine[]
  benchmarkBand?: BenchmarkBand
  unit?: string
  methodologyId?: string
  emptyReason?: string | null
  suppressed?: boolean
  summary: string
}

export interface TableColumn {
  key: string
  label: string
  format?: 'count' | 'rate' | 'ratio' | 'score' | 'days' | 'text' | 'date'
}

export interface DetailTable {
  id: string
  title: string
  columns: TableColumn[]
  rows: Record<string, string | number | null>[]
}

export interface PageVisualBundle {
  pageId: string
  kpis: KpiTile[]
  charts: ChartPayload[]
  table: DetailTable
  freshness: DataFreshness
  filterEcho: FilterContext
}

// ---------------------------------------------------------------------------
// Methodology
// ---------------------------------------------------------------------------

export interface MethodologyEntry {
  id: string
  name: string
  definition: string
  sourceTables: string[]
  notes?: string
  reconciliationTarget?: string
}

// ---------------------------------------------------------------------------
// Ingestion — source adapter contract
// ---------------------------------------------------------------------------

export interface RawColumn {
  name: string
  sampleValues: string[]
}

export interface RawTable {
  /** Logical dataset key matching a physical target table */
  datasetKey: string
  /** Display name for the sheet / source */
  sourceLabel: string
  headerRowIndex: number
  columns: RawColumn[]
  rows: Record<string, string>[]
  rowCount: number
}

export interface SourceAdapter {
  parse(source: unknown): Promise<RawTable[]>
}

export type TargetTable =
  | 'employees'
  | 'compensation_events'
  | 'performance_reviews'
  | 'competency_scores'
  | 'engagement_responses'
  | 'engagement_questions'
  | 'engagement_open_ended'
  | 'requisitions'
  | 'funnel_events'
  | 'offers'
  | 'application_sources'
  | 'recruiters'
  | 'market_benchmarks'
  | 'competency_framework'
  | 'employee_snapshots'
  | 'termination_history'
  | 'engagement_score_history'
  | 'engagement_survey_waves'
  | 'org_events'
  | 'exit_interviews'

export interface ColumnMapping {
  sourceColumn: string | null
  targetColumn: string
  required: boolean
}

export interface DatasetPreview {
  datasetKey: TargetTable | 'unknown'
  sourceLabel: string
  detectedConfidence: number
  headerRowIndex: number
  mappings: ColumnMapping[]
  unmappedSourceColumns: string[]
  missingRequiredTargets: string[]
  sampleRows: Record<string, string>[]
  rowCount: number
}

export interface ValidationIssue {
  datasetKey: string
  severity: 'error' | 'warning'
  rule: string
  rowNumber: number | null
  message: string
}

export interface ValidationReport {
  ok: boolean
  issues: ValidationIssue[]
  rowCounts: Record<string, number>
}

export interface DataLoadRecord {
  id: string
  loadedAt: string
  sourceType: string
  fileNames: string[]
  rowCounts: Record<string, number>
  validationSummary: string
  loadedBy: string | null
}

export interface IngestConfirmResult {
  load: DataLoadRecord
  promoted: Record<string, number>
}

// ---------------------------------------------------------------------------
// Wizard
// ---------------------------------------------------------------------------

export interface WizardChartSpec {
  form: ChartForm
  dimension: string
  measure: string
  series?: string
  filters: FilterContext
  title: string
  referenceLines?: ReferenceLine[]
  /** Optional rendered series — when present, shared MetricChart draws them. */
  points?: ChartSeriesPoint[]
  seriesKeys?: string[]
  summary?: string
  methodologyId?: string
}

export interface WizardCitation {
  measureId: string
  tables: string[]
}

// ---------------------------------------------------------------------------
// Drill-through placeholders (v0.1 destinations)
// ---------------------------------------------------------------------------

export type DrillThroughEntity =
  | 'manager'
  | 'function'
  | 'employee'
  | 'requisition'

export interface DrillThroughParams {
  entity: DrillThroughEntity
  id: string
  filters: FilterContext
}

// ---------------------------------------------------------------------------
// API envelopes
// ---------------------------------------------------------------------------

export interface ApiErrorBody {
  error: string
  code?: string
  details?: unknown
}

export interface FilterMetaResponse {
  hierarchies: HierarchyDeclaration[]
  functions: string[]
  locations: string[]
  levelBands: string[]
  tenureBands: string[]
  freshness: DataFreshness
  minCellSize: number
}

export interface ExecutiveOverviewResponse extends PageVisualBundle {
  pageId: 'executive'
}

export interface WorkforceResponse extends PageVisualBundle {
  pageId: 'workforce'
}

export interface AttritionResponse extends PageVisualBundle {
  pageId: 'attrition'
}

export interface CompensationResponse extends PageVisualBundle {
  pageId: 'compensation'
}

export interface RecruitingResponse extends PageVisualBundle {
  pageId: 'recruiting'
}

export interface EngagementResponse extends PageVisualBundle {
  pageId: 'engagement'
}

export interface MethodologyResponse {
  entries: MethodologyEntry[]
  mappingCaveats: string[]
  engagementInstrumentNotes: string[]
}

// ---------------------------------------------------------------------------
// Class 3 — advanced analytics, risk, and manager/talent surfaces
// ---------------------------------------------------------------------------

/** Hazard / survival minimum exposed n (D-1). */
export const MIN_CELL_SIZE_HAZARD = 10

export type RiskFactorStatus =
  | 'complete'
  | 'partial'
  | 'insufficient'
  | 'inapplicable'

export interface RiskFactorResult {
  factor: string
  available: boolean
  status: RiskFactorStatus
  points: number
  maximum_points: number
  driving_value: string | number | null
  reason: string
  missing_reason: string | null
  source_measure: string
  as_of_date: string | null
}

export interface AttritionRiskScore {
  total_score: number | null
  risk_band: 'Low' | 'Moderate' | 'Elevated' | 'High' | null
  data_sufficiency: 'complete' | 'partial' | 'insufficient'
  available_factor_count: number
  missing_factor_count: number
  methodology_version: string
  factor_weight_version: string
  band_threshold_version: string
  calculated_at: string
  reporting_boundary: string | null
  data_load_id: string | null
  factors: RiskFactorResult[]
}

export interface InvestigationGuidance {
  signal: string
  scope: string
  period: string
  supporting_measures: string[]
  comparison: string | null
  factor_summary: string | null
  data_limitations: string | null
  suggested_next_analysis: string[]
  suggested_human_questions: string[]
  methodology_links: string[]
  responsible_use_note: string
}

export interface DashboardContext {
  current_route: string
  current_page: string
  active_filters: FilterContext
  period: PeriodSelection
  comparison_mode: ComparisonMode
  drill_path: string[] | null
  selected_entity: string | null
  selected_visual_id: string | null
  selected_mark: string | null
  visible_measures: string[]
  scoped_manager_id: string | null
  scoped_function: string | null
  scoped_location: string | null
  scoped_employee_id: string | null
  scoped_requisition_id: string | null
  methodology_version: string | null
  data_load_id: string | null
}

export type WizardActionType =
  | 'apply_filters'
  | 'clear_filters'
  | 'set_period'
  | 'set_comparison'
  | 'open_page'
  | 'open_manager'
  | 'open_employee'
  | 'open_methodology'
  | 'create_customized_report'
  | 'update_customized_report'
  | 'duplicate_customized_report'
  | 'refresh_customized_report'
  | 'copy_report_link'

export interface WizardAction {
  type: WizardActionType
  label: string
  requiresConfirmation: boolean
  payload: Record<string, unknown>
}

export interface WizardConversationTurn {
  role: 'user' | 'assistant'
  content: string
  measures?: string[]
  chart?: WizardChartSpec | null
  charts?: WizardChartSpec[]
}

export interface WizardRequest {
  question: string
  filters: FilterContext
  context?: Partial<DashboardContext> | null
  conversation?: WizardConversationTurn[]
  confirmAction?: WizardAction | null
}

export interface WizardResponse {
  answer: string
  citations: WizardCitation[]
  chart: WizardChartSpec | null
  /** When the wizard builds several composition cuts (level / geo / age). */
  charts?: WizardChartSpec[]
  filterOverridden: boolean
  refused: boolean
  refusalReason: string | null
  proposedActions?: WizardAction[]
  guidance?: InvestigationGuidance | null
  /** Draft spec for create/update customized report (filled on save). */
  reportSpec?: Partial<CustomizedReportSpec> | null
}

export interface CustomizedReportVisual {
  id: string
  title: string
  chart: WizardChartSpec
  annotations?: string[]
}

export interface CustomizedReportSpec {
  id: string
  title: string
  description: string
  created_at: string
  created_by: string
  source_conversation_id: string | null
  source_message_id: string | null
  report_type: string
  measures: string[]
  dimensions: string[]
  filters: FilterContext
  period: PeriodSelection
  comparison_mode: ComparisonMode
  visuals: CustomizedReportVisual[]
  tables: DetailTable[]
  annotations: string[]
  methodology_links: string[]
  data_load_id: string | null
  semantic_model_version: string
  risk_methodology_version: string | null
  refresh_behavior: 'on_open' | 'manual'
  status: 'draft' | 'active' | 'archived'
  created_via_wizard?: boolean
  version?: number
}

export interface AdvancedAnalyticsMethodologyPanel {
  methodologyVersion: string
  factorWeightVersion: string
  bandThresholdVersion: string
  weights: { factor: string; calibrated: number; published: number }[]
  bands: { low: string; moderate: string; elevated: string; high: string }
  minCellManager: number
  minCellHazard: number
  responsibleUse: string
  backtestSummary: string | null
}

export interface AdvancedAnalyticsResponse extends PageVisualBundle {
  pageId: 'advanced_analytics'
  guidance: InvestigationGuidance[]
  methodologyPanel: AdvancedAnalyticsMethodologyPanel | null
  backtest: ChartPayload | null
}

export interface ManagerDetailResponse {
  managerId: string
  suppressed: boolean
  suppressionReason: string | null
  teamSize: number
  spanOfControl: number
  managerDebt: boolean
  kpis: KpiTile[]
  charts: ChartPayload[]
  table: DetailTable
  peerBasis: string | null
  freshness: DataFreshness
  filterEcho: FilterContext
  responsibleUseNote: string
}

export interface Employee360Response {
  employeeId: string
  profile: Record<string, string | number | null>
  modules: { id: string; title: string; rows: DetailTable }[]
  risk: AttritionRiskScore | null
  charts: ChartPayload[]
  freshness: DataFreshness
  responsibleUseNote: string
  dataSufficiencyNote: string | null
}
