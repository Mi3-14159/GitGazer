import  { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

const client = new SSMClient({});
const store = new Map<string, string>();

export const getClient = (): SSMClient => client;

/**
 * Retrieves the value of a parameter from AWS Systems Manager Parameter Store.
 * If the parameter is already cached, it returns the cached value.
 * Otherwise, it fetches the parameter value from AWS SSM and caches it for future use.
 *
 * @param name - The name of the parameter to retrieve.
 * @returns A Promise that resolves to the value of the parameter.
 */
export const getParameter = async (name: string): Promise<string> => {
    if (store.has(name)) {
        return store.get(name) as string;
    }

    const command = new GetParameterCommand({
        Name: name,
        WithDecryption: true,
    });
  
  
    const {Parameter: {Value}} = await client.send(command);
    console.info("got ssm parameter ", name);
    
    store.set(name, Value);
    return Value;
  }