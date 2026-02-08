export type QueryRequestBody = {
  query: string;
};

export const isQueryRequestBody = (body: any): body is QueryRequestBody => {
  return typeof body === "object" && typeof body.query === "string";
};

export type QueryResponse = {
  queryId: string;
  status?:
    | "REQUESTED"
    | "CANCELLED"
    | "FAILED"
    | "QUEUED"
    | "RUNNING"
    | "SUCCEEDED";
  resultsUrl?: string;
};

export type TableSchemaField = {
  name: string;
  type: string;
  comment?: string;
};

export type TableSchema = {
  namespace: string;
  table: string;
  fields: TableSchemaField[];
};

export type QuerySuggestionRequest = {
  prompt: string;
};

export const isQuerySuggestionRequest = (
  body: any,
): body is QuerySuggestionRequest => {
  return typeof body === "object" && typeof body.prompt === "string";
};

export type QuerySuggestionResponse = {
  suggestion: string;
};

export const isQuerySuggestionResponse = (
  body: any,
): body is QuerySuggestionResponse => {
  return typeof body === "object" && typeof body.suggestion === "string";
};
