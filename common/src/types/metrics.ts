export enum MetricsParameterStat {
  SUM = "sum",
  AVG = "avg",
  MAX = "max",
  MIN = "min",
}

export enum MetricsParameterDimension {
  INTEGRATION_ID = "integration_id",
  OWNER = "owner",
  REPOSITORY = "repo",
  WORKFLOW = "workflow",
  JOB = "job",
  SENDER = "sender",
  CONCLUSION = "conclusion",
  BRANCH = "branch",
}

export type JobMetricsSeries = {
  timestamps: number[]; // seconds since epoch
  groups: JobMetricsSeriesGroup[];
  values: (number | null)[][];
};

export type JobMetricsSeriesGroup = {
  dimensions: string[]; // metricName:metricValue
};

export type JobMetricsResponse = {
  series: JobMetricsSeries[];
};

export type JobMetricsFilter = {
  name: MetricsParameterDimension;
  values: string[];
};

export type JobMetricsParameters = {
  period: number; // in seconds
  range: {
    start: number; // in seconds since epoch
    end: number; // in seconds since epoch
  };
  stat: MetricsParameterStat;
  dimensions: MetricsParameterDimension[];
  filters: JobMetricsFilter[];
};

export const isJobMetricsParameters = (
  params: any,
): params is JobMetricsParameters => {
  if (
    typeof params !== "object" ||
    typeof params.period !== "number" ||
    typeof params.range !== "object" ||
    typeof params.range.start !== "number" ||
    typeof params.range.end !== "number" ||
    params.range.start >= params.range.end ||
    params.range.end > Date.now() / 1000 ||
    !Object.values(MetricsParameterStat).includes(params.stat) ||
    !Array.isArray(params.dimensions) ||
    !params.dimensions.every((dim: any) =>
      Object.values(MetricsParameterDimension).includes(dim),
    ) ||
    !Array.isArray(params.filters) ||
    !params.filters.every(
      (filter: any) =>
        typeof filter.name === "string" &&
        Array.isArray(filter.values) &&
        filter.values.every((v: any) => typeof v === "string"),
    )
  ) {
    return false;
  }

  return true;
};
