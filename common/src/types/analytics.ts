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
