import config from '@/config';
import {createAppAuth} from '@octokit/auth-app';
import {Octokit} from '@octokit/rest';

export const getInstallationOctokit = (installationId: number): Octokit => {
    const appId = config.get('githubApp.id');
    const privateKey = config.get('githubApp.privateKey');

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
