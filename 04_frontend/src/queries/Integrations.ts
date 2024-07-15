export type Integration = {
  id: string;
  secret: string;
  owner: string;
  users: string[];
  label: string;
};

export const listIntegrations = `query ListIntegrations {
  listIntegrations {
      id
      secret
      owner
      users
      label
  }
}`;

export const putIntegration = (label: string) => `mutation PutIntegration {
  putIntegration(input: {label: "${label}"}) {
      id
      secret
      owner
      users
      label
  }
}`;

export type ListIntegrationsResponse = {
  listIntegrations: Integration[];
};

export type PutIntegrationsResponse = {
  putIntegration: Integration;
};

export const deleteIntegration = (
  id: string,
): string => `mutation DeleteIntegration {
  deleteIntegration(id: "${id}")
}`;

export type DeleteIntegrationResponse = {
  deleteIntegration: boolean;
};
