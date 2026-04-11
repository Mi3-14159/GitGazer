import {useAuth} from '@/composables/useAuth';
import {parseApiResponse} from '@/utils/apiResponse';
import type {CreateInvitationInput, IntegrationInvitation, IntegrationMember, MemberRole} from '@common/types';

const API_ENDPOINT = import.meta.env.VITE_REST_API_ENDPOINT;

export const useMembers = () => {
    const {fetchWithAuth} = useAuth();

    const getMembers = async (integrationId: string): Promise<IntegrationMember[]> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/members`);
        if (!response.ok) {
            throw new Error(`Failed to fetch members: ${response.status}`);
        }
        return parseApiResponse<IntegrationMember[]>(response);
    };

    const changeRole = async (integrationId: string, userId: number, role: MemberRole): Promise<void> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/members/${userId}/role`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({role}),
        });
        if (!response.ok) {
            throw new Error(`Failed to change role: ${response.status}`);
        }
    };

    const removeMember = async (integrationId: string, userId: number): Promise<void> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/members/${userId}`, {
            method: 'DELETE',
        });
        if (response.status !== 204) {
            throw new Error(`Failed to remove member: ${response.status}`);
        }
    };

    const getInvitations = async (integrationId: string): Promise<IntegrationInvitation[]> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/invitations`);
        if (!response.ok) {
            throw new Error(`Failed to fetch invitations: ${response.status}`);
        }
        return parseApiResponse<IntegrationInvitation[]>(response);
    };

    const createInvitation = async (integrationId: string, input: CreateInvitationInput): Promise<IntegrationInvitation> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/invitations`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(input),
        });
        if (!response.ok) {
            throw new Error(`Failed to create invitation: ${response.status}`);
        }
        return parseApiResponse<IntegrationInvitation>(response);
    };

    const revokeInvitation = async (integrationId: string, invitationId: string): Promise<void> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/invitations/${invitationId}`, {
            method: 'DELETE',
        });
        if (response.status !== 204) {
            throw new Error(`Failed to revoke invitation: ${response.status}`);
        }
    };

    const resendInvitation = async (integrationId: string, invitationId: string): Promise<void> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/invitations/${invitationId}/resend`, {
            method: 'POST',
        });
        if (!response.ok) {
            throw new Error(`Failed to resend invitation: ${response.status}`);
        }
    };

    const acceptInvitation = async (inviteToken: string): Promise<void> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/invitations/accept`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({inviteToken}),
        });
        if (!response.ok) {
            const body = await response.json().catch(() => null);
            throw new Error(body?.message ?? `Failed to accept invitation: ${response.status}`);
        }
    };

    const leaveIntegration = async (integrationId: string): Promise<void> => {
        const response = await fetchWithAuth(`${API_ENDPOINT}/integrations/${integrationId}/leave`, {
            method: 'POST',
        });
        if (response.status !== 204) {
            const body = await response.json().catch(() => null);
            throw new Error(body?.message ?? `Failed to leave integration: ${response.status}`);
        }
    };

    return {
        getMembers,
        changeRole,
        removeMember,
        getInvitations,
        createInvitation,
        revokeInvitation,
        resendInvitation,
        acceptInvitation,
        leaveIntegration,
    };
};
