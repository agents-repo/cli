/** Registry-proxy opt-out for versioned ZIP download metrics (see registry-proxy docs). */
export const DOWNLOAD_METRICS_HEADER_NAME = 'Agents-Repo-Download-Metrics'
export const DOWNLOAD_METRICS_SKIP_VALUE = 'skip'

export const downloadMetricsSkipRequestHeaders = (): Readonly<Record<string, string>> => ({
  [DOWNLOAD_METRICS_HEADER_NAME]: DOWNLOAD_METRICS_SKIP_VALUE,
})
