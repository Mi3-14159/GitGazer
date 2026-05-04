import {proxyFetch} from '@/shared/clients/proxy-fetch';
import config from '@/shared/config';
import type {GithubOrgRole} from '@gitgazer/db/types';
import {createAppAuth} from '@octokit/auth-app';
import {Octokit} from '@octokit/rest';

export const getInstallationOctokit = (installationId: number): Octokit => {
    const {id: appId, privateKey} = config.get('githubApp');

    if (!appId || !privateKey) {
        throw new Error('GitHub App credentials not configured');
    }

    return new Octokit({
        authStrategy: createAppAuth,
        auth: {
            appId,
            privateKey,
            installationId,
        },
        request: {
            fetch: proxyFetch,
        },
    });
};

export type RepoInfo = {
    id: number;
    name: string;
    fullName: string;
    owner: string;
    private: boolean;
};

export const listInstallationRepos = async (installationId: number): Promise<RepoInfo[]> => {
    const octokit = getInstallationOctokit(installationId);
    const repos: RepoInfo[] = [];

    for await (const response of octokit.paginate.iterator(octokit.apps.listReposAccessibleToInstallation, {
        per_page: 100,
    })) {
        for (const repo of response.data) {
            repos.push({
                id: repo.id,
                name: repo.name,
                fullName: repo.full_name,
                owner: repo.owner.login,
                private: repo.private,
            });
        }
    }

    return repos;
};

export type OrgMemberInfo = {
    id: number;
    login: string;
    role: GithubOrgRole;
};

export const listOrgMembers = async (installationId: number, org: string): Promise<OrgMemberInfo[]> => {
    const octokit = getInstallationOctokit(installationId);
    const members: OrgMemberInfo[] = [];

    for (const role of ['admin', 'member'] as const) {
        for await (const response of octokit.paginate.iterator(octokit.orgs.listMembers, {
            org,
            role,
            per_page: 100,
        })) {
            for (const member of response.data) {
                members.push({
                    id: member.id,
                    login: member.login,
                    role,
                });
            }
        }
    }

    return members;
};

export const createRepoWebhook = async (
    octokit: Octokit,
    owner: string,
    repo: string,
    webhookUrl: string,
    secret: string,
    events: string[],
): Promise<number> => {
    const response = await octokit.repos.createWebhook({
        owner,
        repo,
        config: {
            url: webhookUrl,
            content_type: 'json',
            secret,
        },
        events,
        active: true,
    });

    return response.data.id;
};

export const createOrgWebhook = async (octokit: Octokit, org: string, webhookUrl: string, secret: string, events: string[]): Promise<number> => {
    const response = await octokit.orgs.createWebhook({
        org,
        name: 'web',
        config: {
            url: webhookUrl,
            content_type: 'json',
            secret,
        },
        events,
        active: true,
    });

    return response.data.id;
};

export const deleteRepoWebhook = async (octokit: Octokit, owner: string, repo: string, hookId: number): Promise<void> => {
    await octokit.repos.deleteWebhook({owner, repo, hook_id: hookId});
};

export const deleteOrgWebhook = async (octokit: Octokit, org: string, hookId: number): Promise<void> => {
    await octokit.orgs.deleteWebhook({org, hook_id: hookId});
};

export const updateRepoWebhookEvents = async (octokit: Octokit, owner: string, repo: string, hookId: number, events: string[]): Promise<void> => {
    await octokit.repos.updateWebhook({owner, repo, hook_id: hookId, events, active: true});
};

export const updateOrgWebhookEvents = async (octokit: Octokit, org: string, hookId: number, events: string[]): Promise<void> => {
    await octokit.orgs.updateWebhook({org, hook_id: hookId, events, active: true});
};

export const updateRepoWebhookSecret = async (
    octokit: Octokit,
    owner: string,
    repo: string,
    hookId: number,
    url: string,
    secret: string,
): Promise<void> => {
    await octokit.repos.updateWebhook({owner, repo, hook_id: hookId, config: {url, content_type: 'json', secret}});
};

export const updateOrgWebhookSecret = async (octokit: Octokit, org: string, hookId: number, url: string, secret: string): Promise<void> => {
    await octokit.orgs.updateWebhook({org, hook_id: hookId, config: {url, content_type: 'json', secret}});
};
