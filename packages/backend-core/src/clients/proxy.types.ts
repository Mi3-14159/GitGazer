export type ProxyRequest = {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
};

export type ProxyResponse = {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
};
