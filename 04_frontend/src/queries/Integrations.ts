export interface Integration {
  id: string;
  secret: string;
  users: string[];
}

export const listIntegrations = `query ListIntegrations {
  listIntegrations {
      id
      secret
      users
  }
}`;

export interface ListIntegrationsResponse {
  listIntegrations: Integration[];
}
