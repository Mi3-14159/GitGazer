/**
 * Custom API client using fetch with cookie-based authentication
 * Replaces AWS Amplify API client
 */

const API_BASE_URL = import.meta.env.VITE_REST_API_ENDPOINT;

export interface ApiRequestOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    headers?: Record<string, string>;
}

export interface ApiResponse<T = any> {
    data: T;
    status: number;
    headers: Headers;
}

/**
 * Make an API request with cookie-based authentication
 */
async function apiRequest<T = any>(path: string, options: ApiRequestOptions = {}): Promise<ApiResponse<T>> {
    const {method = 'GET', body, headers = {}} = options;

    const requestInit: RequestInit = {
        method,
        credentials: 'include', // Always send cookies
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    };

    if (body && method !== 'GET') {
        requestInit.body = JSON.stringify(body);
    }

    const url = `${API_BASE_URL}${path}`;

    try {
        const response = await fetch(url, requestInit);

        // Handle authentication errors
        if (response.status === 401) {
            // Try to refresh token
            const refreshed = await refreshToken();
            if (refreshed) {
                // Retry the original request
                const retryResponse = await fetch(url, requestInit);
                const data = retryResponse.status === 204 ? null : await retryResponse.json();
                return {
                    data,
                    status: retryResponse.status,
                    headers: retryResponse.headers,
                };
            } else {
                // Refresh failed, redirect to login
                window.location.href = '/login';
                throw new Error('Authentication required');
            }
        }

        // Handle other errors
        if (!response.ok && response.status !== 204) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `API request failed: ${response.statusText}`);
        }

        // Parse response
        const data = response.status === 204 ? null : await response.json();

        return {
            data,
            status: response.status,
            headers: response.headers,
        };
    } catch (error) {
        console.error(`API request failed: ${method} ${path}`, error);
        throw error;
    }
}

/**
 * Refresh authentication tokens using refresh token cookie
 */
async function refreshToken(): Promise<boolean> {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        });

        return response.ok;
    } catch (error) {
        console.error('Token refresh failed:', error);
        return false;
    }
}

/**
 * GET request
 */
export async function get<T = any>(path: string): Promise<ApiResponse<T>> {
    return apiRequest<T>(path, {method: 'GET'});
}

/**
 * POST request
 */
export async function post<T = any>(path: string, body?: any): Promise<ApiResponse<T>> {
    return apiRequest<T>(path, {method: 'POST', body});
}

/**
 * PUT request
 */
export async function put<T = any>(path: string, body?: any): Promise<ApiResponse<T>> {
    return apiRequest<T>(path, {method: 'PUT', body});
}

/**
 * DELETE request
 */
export async function del<T = any>(path: string): Promise<ApiResponse<T>> {
    return apiRequest<T>(path, {method: 'DELETE'});
}

/**
 * Check if user is authenticated (has valid session cookies)
 */
export async function checkAuth(): Promise<boolean> {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/session`, {
            method: 'GET',
            credentials: 'include',
        });

        if (response.ok) {
            const data = await response.json();
            return data.authenticated === true;
        }

        return false;
    } catch (error) {
        console.error('Auth check failed:', error);
        return false;
    }
}
