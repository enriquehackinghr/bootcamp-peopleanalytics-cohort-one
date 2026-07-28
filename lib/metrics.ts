export type EmploymentStatus = 'active' | 'terminated'

export interface Employee {
  employeeId: string
  fullName: string
  managerId: string | null
  status: EmploymentStatus
  hireDate: string | null
  terminationDate: string | null
  department: string | null
}

export interface WorkforceMetrics {
  totalEmployees: number
  turnoverRate: number
  spanOfControl: number
  terminatedCount: number
  managerCount: number
}

type MappedField =
  | keyof Employee
  | 'firstName'
  | 'lastName'
  | 'ignore'

const STATUS_ALIASES: Record<string, EmploymentStatus> = {
  active: 'active',
  employed: 'active',
  current: 'active',
  terminated: 'terminated',
  inactive: 'terminated',
  separated: 'terminated',
  resigned: 'terminated',
}

const FIELD_MAP: Record<string, MappedField> = {
  employee_id: 'employeeId',
  emp_id: 'employeeId',
  id: 'employeeId',
  full_name: 'fullName',
  name: 'fullName',
  employee_name: 'fullName',
  first_name: 'firstName',
  last_name: 'lastName',
  manager_id: 'managerId',
  manager_employee_id: 'managerId',
  manager: 'managerId',
  reports_to: 'managerId',
  status: 'status',
  employment_status: 'status',
  hire_date: 'hireDate',
  start_date: 'hireDate',
  termination_date: 'terminationDate',
  term_date: 'terminationDate',
  end_date: 'terminationDate',
  department: 'department',
  dept: 'department',
}

const MANAGER_HEADERS = new Set([
  'manager_id',
  'manager_employee_id',
  'manager',
  'reports_to',
])

const STATUS_HEADERS = new Set(['status', 'employment_status'])

const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xls'] as const

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (char === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

function resolveStatus(value: string): EmploymentStatus {
  const key = value.trim().toLowerCase()
  return STATUS_ALIASES[key] ?? 'active'
}

function emptyToNull(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed
}

function cellToString(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) {
    const year = value.getFullYear()
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return String(value).trim()
}

function isHeaderRow(cells: string[]): boolean {
  return cells.map(normalizeHeader).some((header) => FIELD_MAP[header] === 'employeeId')
}

function findHeaderRowIndex(matrix: string[][]): number {
  const index = matrix.findIndex(isHeaderRow)
  if (index === -1) {
    throw new Error(
      'File must include an employee_id column. If your sheet has grouped headers, keep the real column names in the next row.',
    )
  }
  return index
}

function employeesFromTable(headers: string[], rows: string[][]): Employee[] {
  const normalizedHeaders = headers.map(normalizeHeader)
  const fieldKeys = normalizedHeaders.map((header) => FIELD_MAP[header] ?? null)

  if (!fieldKeys.includes('employeeId')) {
    throw new Error('File must include an employee_id column.')
  }
  if (!normalizedHeaders.some((h) => MANAGER_HEADERS.has(h))) {
    throw new Error(
      'File must include a manager_id or manager_employee_id column.',
    )
  }
  if (!normalizedHeaders.some((h) => STATUS_HEADERS.has(h))) {
    throw new Error(
      'File must include a status or employment_status column (active / terminated).',
    )
  }

  const employees: Employee[] = []

  rows.forEach((cells, index) => {
    const row: Partial<Employee> & { firstName?: string; lastName?: string } = {}

    fieldKeys.forEach((key, i) => {
      if (!key || key === 'ignore') return
      const raw = cells[i] ?? ''
      if (key === 'status') {
        row.status = resolveStatus(raw)
        return
      }
      if (key === 'firstName' || key === 'lastName') {
        row[key] = raw.trim()
        return
      }
      if (
        key === 'managerId' ||
        key === 'hireDate' ||
        key === 'terminationDate' ||
        key === 'department'
      ) {
        row[key] = emptyToNull(raw)
        return
      }
      row[key] = raw.trim()
    })

    if (!row.employeeId) {
      // Skip blank trailing rows common in Excel exports
      if (cells.every((cell) => cell.trim() === '')) return
      throw new Error(`Row ${index + 2} is missing employee_id.`)
    }

    const combinedName = [row.firstName, row.lastName]
      .filter(Boolean)
      .join(' ')
      .trim()

    employees.push({
      employeeId: row.employeeId,
      fullName: row.fullName || combinedName || row.employeeId,
      managerId: row.managerId ?? null,
      status: row.status ?? 'active',
      hireDate: row.hireDate ?? null,
      terminationDate: row.terminationDate ?? null,
      department: row.department ?? null,
    })
  })

  if (employees.length === 0) {
    throw new Error('File needs a header row and at least one employee.')
  }

  return employees
}

function employeesFromMatrix(matrix: string[][]): Employee[] {
  if (matrix.length < 2) {
    throw new Error('File needs a header row and at least one employee.')
  }

  const headerIndex = findHeaderRowIndex(matrix)
  const headers = matrix[headerIndex]
  const rows = matrix.slice(headerIndex + 1)
  return employeesFromTable(headers, rows)
}

export function isAcceptedEmployeeFile(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

export function parseEmployeeCsv(text: string): Employee[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)

  if (lines.length < 2) {
    throw new Error('CSV needs a header row and at least one employee.')
  }

  return employeesFromMatrix(lines.map(parseCsvLine))
}

export async function parseEmployeeExcel(buffer: ArrayBuffer): Promise<Employee[]> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) {
    throw new Error('Excel file has no worksheets.')
  }

  const sheet = workbook.Sheets[firstSheetName]
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null | undefined)[]>(
    sheet,
    { header: 1, defval: '', blankrows: false },
  ).map((row) => row.map(cellToString))

  return employeesFromMatrix(matrix)
}

export async function parseEmployeeFile(file: File): Promise<Employee[]> {
  const lower = file.name.toLowerCase()

  if (lower.endsWith('.csv')) {
    return parseEmployeeCsv(await file.text())
  }

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return parseEmployeeExcel(await file.arrayBuffer())
  }

  throw new Error('Please upload a .csv, .xlsx, or .xls file.')
}

export function computeWorkforceMetrics(employees: Employee[]): WorkforceMetrics {
  const active = employees.filter((e) => e.status === 'active')
  const terminated = employees.filter((e) => e.status === 'terminated')
  const totalInScope = active.length + terminated.length

  const turnoverRate =
    totalInScope === 0 ? 0 : (terminated.length / totalInScope) * 100

  const reportCounts = new Map<string, number>()
  for (const employee of active) {
    if (!employee.managerId) continue
    reportCounts.set(
      employee.managerId,
      (reportCounts.get(employee.managerId) ?? 0) + 1,
    )
  }

  const spans = [...reportCounts.values()]
  const spanOfControl =
    spans.length === 0
      ? 0
      : spans.reduce((sum, n) => sum + n, 0) / spans.length

  return {
    totalEmployees: active.length,
    turnoverRate,
    spanOfControl,
    terminatedCount: terminated.length,
    managerCount: spans.length,
  }
}
