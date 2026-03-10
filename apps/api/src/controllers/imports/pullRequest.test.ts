import type {PullRequestOpenedEvent} from '@octokit/webhooks-types';
import {beforeEach, describe, expect, it, vi} from 'vitest';

// Symbols for mocked schema tables
const mockOrganizations = Symbol('organizations');
const mockUser = Symbol('user');
const mockRepositories = Symbol('repositories');
const mockPullRequests = Symbol('pullRequests');
const mockEnterprises = Symbol('enterprises');

vi.mock('@gitgazer/db/schema/github/workflows', () => ({
    organizations: mockOrganizations,
    user: mockUser,
    repositories: mockRepositories,
    pullRequests: mockPullRequests,
    enterprises: mockEnterprises,
}));

const buildMockTx = (
    returnedPr: any,
    options: {
        returnExistingUsers?: boolean;
        returnExistingRepo?: boolean;
        withOrganization?: boolean;
        withEnterprise?: boolean;
    } = {},
) => {
    // Mock data for entities
    const mockRepo = {
        integrationId: 'int-1',
        id: 200,
        organizationId: options.withOrganization ? 999 : null,
        name: 'repo',
        private: false,
        createdAt: new Date('2025-01-01T00:00:00Z'),
        updatedAt: new Date('2025-06-01T00:00:00Z'),
        ownerId: 100,
    };

    const mockUsers = [
        {integrationId: 'int-1', id: 100, login: 'owner', type: 'User'},
        {integrationId: 'int-1', id: 500, login: 'author', type: 'User'},
    ];

    const mockOrg = {
        integrationId: 'int-1',
        id: 999,
        enterpriseId: options.withEnterprise ? 888 : null,
        login: 'my-org',
        description: null,
    };

    const mockEnterprise = {
        integrationId: 'int-1',
        id: 888,
        name: 'my-enterprise',
    };

    // Track which table is being inserted/selected
    let currentTable: symbol | null = null;

    const returning = vi.fn(() => {
        // For repository insert
        if (currentTable === mockRepositories) {
            return Promise.resolve(options.returnExistingRepo ? [] : [mockRepo]);
        }
        // For users bulk insert
        if (currentTable === mockUser) {
            return Promise.resolve(options.returnExistingUsers ? [] : mockUsers);
        }
        // For pull request (uses onConflictDoUpdate, always returns)
        if (currentTable === mockPullRequests) {
            return Promise.resolve([returnedPr]);
        }
        // For organization
        if (currentTable === mockOrganizations) {
            return Promise.resolve(options.withOrganization ? [mockOrg] : []);
        }
        // For enterprise
        if (currentTable === mockEnterprises) {
            return Promise.resolve(options.withEnterprise ? [mockEnterprise] : []);
        }
        return Promise.resolve([]);
    });

    const onConflictDoNothing = vi.fn(() => ({returning}));
    const onConflictDoUpdate = vi.fn(() => ({returning}));

    const values = vi.fn(() => {
        return {
            onConflictDoNothing,
            onConflictDoUpdate,
        };
    });

    // Mock for select queries
    const limitMock = vi.fn(() => {
        // Return appropriate data based on which table we're selecting from
        if (currentTable === mockRepositories) {
            return Promise.resolve([mockRepo]);
        }
        if (currentTable === mockUser) {
            return Promise.resolve(mockUsers);
        }
        if (currentTable === mockOrganizations) {
            return Promise.resolve([mockOrg]);
        }
        if (currentTable === mockEnterprises) {
            return Promise.resolve([mockEnterprise]);
        }
        return Promise.resolve([]);
    });

    const whereMock = vi.fn(() => ({
        limit: limitMock,
    }));

    // Also support select without where().limit() for bulk user fetching
    const selectWithoutLimit = Object.assign(
        vi.fn(() => {
            if (currentTable === mockUser) {
                return Promise.resolve(mockUsers);
            }
            return Promise.resolve([]);
        }),
        {
            where: whereMock,
        },
    );

    const fromMock = vi.fn((table: symbol) => {
        currentTable = table;
        return selectWithoutLimit;
    });

    const select = vi.fn(() => ({
        from: fromMock,
    }));

    const insert = vi.fn((table: symbol) => {
        currentTable = table;
        return {values};
    });

    return {
        insert,
        select,
        _onConflictDoNothing: onConflictDoNothing,
        _onConflictDoUpdate: onConflictDoUpdate,
        _returning: returning,
    };
};

const buildPullRequestEvent = (overrides: Partial<PullRequestOpenedEvent> = {}): PullRequestOpenedEvent => ({
    action: 'opened',
    number: 42,
    pull_request: {
        url: 'https://api.github.com/repos/owner/repo/pulls/42',
        id: 1001,
        node_id: 'PR_node_id',
        html_url: 'https://github.com/owner/repo/pull/42',
        diff_url: 'https://github.com/owner/repo/pull/42.diff',
        patch_url: 'https://github.com/owner/repo/pull/42.patch',
        issue_url: 'https://api.github.com/repos/owner/repo/issues/42',
        number: 42,
        state: 'open',
        locked: false,
        title: 'Add new feature',
        user: {
            login: 'author',
            id: 500,
            node_id: 'U_node',
            avatar_url: '',
            gravatar_id: '',
            url: '',
            html_url: '',
            followers_url: '',
            following_url: '',
            gists_url: '',
            starred_url: '',
            subscriptions_url: '',
            organizations_url: '',
            repos_url: '',
            events_url: '',
            received_events_url: '',
            type: 'User',
            site_admin: false,
        },
        body: 'PR body text',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
        closed_at: null,
        merged_at: null,
        merge_commit_sha: null,
        assignee: null,
        assignees: [],
        requested_reviewers: [],
        requested_teams: [],
        labels: [],
        milestone: null,
        commits_url: '',
        review_comments_url: '',
        review_comment_url: '',
        comments_url: '',
        statuses_url: '',
        head: {
            label: 'owner:feature-branch',
            ref: 'feature-branch',
            sha: 'abc123',
            user: {
                login: 'author',
                id: 500,
                node_id: '',
                avatar_url: '',
                gravatar_id: '',
                url: '',
                html_url: '',
                followers_url: '',
                following_url: '',
                gists_url: '',
                starred_url: '',
                subscriptions_url: '',
                organizations_url: '',
                repos_url: '',
                events_url: '',
                received_events_url: '',
                type: 'User',
                site_admin: false,
            },
            repo: null,
        },
        base: {
            label: 'owner:main',
            ref: 'main',
            sha: 'def456',
            user: {
                login: 'owner',
                id: 100,
                node_id: '',
                avatar_url: '',
                gravatar_id: '',
                url: '',
                html_url: '',
                followers_url: '',
                following_url: '',
                gists_url: '',
                starred_url: '',
                subscriptions_url: '',
                organizations_url: '',
                repos_url: '',
                events_url: '',
                received_events_url: '',
                type: 'User',
                site_admin: false,
            },
            repo: {
                id: 200,
                node_id: '',
                name: 'repo',
                full_name: 'owner/repo',
                private: false,
                owner: {
                    login: 'owner',
                    id: 100,
                    node_id: '',
                    avatar_url: '',
                    gravatar_id: '',
                    url: '',
                    html_url: '',
                    followers_url: '',
                    following_url: '',
                    gists_url: '',
                    starred_url: '',
                    subscriptions_url: '',
                    organizations_url: '',
                    repos_url: '',
                    events_url: '',
                    received_events_url: '',
                    type: 'User',
                    site_admin: false,
                },
                html_url: '',
                description: null,
                fork: false,
                url: '',
                forks_url: '',
                keys_url: '',
                collaborators_url: '',
                teams_url: '',
                hooks_url: '',
                issue_events_url: '',
                events_url: '',
                assignees_url: '',
                branches_url: '',
                tags_url: '',
                blobs_url: '',
                git_tags_url: '',
                git_refs_url: '',
                trees_url: '',
                statuses_url: '',
                languages_url: '',
                stargazers_url: '',
                contributors_url: '',
                subscribers_url: '',
                subscription_url: '',
                commits_url: '',
                git_commits_url: '',
                comments_url: '',
                issue_comment_url: '',
                contents_url: '',
                compare_url: '',
                merges_url: '',
                archive_url: '',
                downloads_url: '',
                issues_url: '',
                pulls_url: '',
                milestones_url: '',
                notifications_url: '',
                labels_url: '',
                releases_url: '',
                deployments_url: '',
                created_at: '2025-01-01T00:00:00Z',
                updated_at: '2025-06-01T00:00:00Z',
                pushed_at: '2025-12-01T00:00:00Z',
                git_url: '',
                ssh_url: '',
                clone_url: '',
                svn_url: '',
                homepage: null,
                size: 100,
                stargazers_count: 0,
                watchers_count: 0,
                language: null,
                has_issues: true,
                has_projects: true,
                has_downloads: true,
                has_wiki: true,
                has_pages: false,
                forks_count: 0,
                mirror_url: null,
                archived: false,
                disabled: false,
                open_issues_count: 0,
                license: null,
                allow_forking: true,
                is_template: false,
                topics: [],
                visibility: 'public',
                forks: 0,
                open_issues: 0,
                watchers: 0,
                default_branch: 'main',
                web_commit_signoff_required: false,
                custom_properties: {},
            },
        },
        _links: {
            self: {href: ''},
            html: {href: ''},
            issue: {href: ''},
            comments: {href: ''},
            review_comments: {href: ''},
            review_comment: {href: ''},
            commits: {href: ''},
            statuses: {href: ''},
        },
        author_association: 'OWNER',
        auto_merge: null,
        active_lock_reason: null,
        draft: false,
        merged: null,
        mergeable: null,
        rebaseable: null,
        mergeable_state: 'unknown',
        merged_by: null,
        comments: 0,
        review_comments: 0,
        maintainer_can_modify: false,
        commits: 1,
        additions: 10,
        deletions: 2,
        changed_files: 1,
    },
    repository: {
        id: 200,
        node_id: 'R_node',
        name: 'repo',
        full_name: 'owner/repo',
        private: false,
        owner: {
            login: 'owner',
            id: 100,
            node_id: '',
            avatar_url: '',
            gravatar_id: '',
            url: '',
            html_url: '',
            followers_url: '',
            following_url: '',
            gists_url: '',
            starred_url: '',
            subscriptions_url: '',
            organizations_url: '',
            repos_url: '',
            events_url: '',
            received_events_url: '',
            type: 'User',
            site_admin: false,
        },
        html_url: '',
        description: null,
        fork: false,
        url: '',
        forks_url: '',
        keys_url: '',
        collaborators_url: '',
        teams_url: '',
        hooks_url: '',
        issue_events_url: '',
        events_url: '',
        assignees_url: '',
        branches_url: '',
        tags_url: '',
        blobs_url: '',
        git_tags_url: '',
        git_refs_url: '',
        trees_url: '',
        statuses_url: '',
        languages_url: '',
        stargazers_url: '',
        contributors_url: '',
        subscribers_url: '',
        subscription_url: '',
        commits_url: '',
        git_commits_url: '',
        comments_url: '',
        issue_comment_url: '',
        contents_url: '',
        compare_url: '',
        merges_url: '',
        archive_url: '',
        downloads_url: '',
        issues_url: '',
        pulls_url: '',
        milestones_url: '',
        notifications_url: '',
        labels_url: '',
        releases_url: '',
        deployments_url: '',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-06-01T00:00:00Z',
        pushed_at: '2025-12-01T00:00:00Z',
        git_url: '',
        ssh_url: '',
        clone_url: '',
        svn_url: '',
        homepage: null,
        size: 100,
        stargazers_count: 0,
        watchers_count: 0,
        language: null,
        has_issues: true,
        has_projects: true,
        has_downloads: true,
        has_wiki: true,
        has_pages: false,
        forks_count: 0,
        mirror_url: null,
        archived: false,
        disabled: false,
        open_issues_count: 0,
        license: null,
        allow_forking: true,
        is_template: false,
        topics: [],
        visibility: 'public',
        forks: 0,
        open_issues: 0,
        watchers: 0,
        default_branch: 'main',
        stargazers: 0,
        master_branch: 'main',
        web_commit_signoff_required: false,
        custom_properties: {},
    },
    sender: {
        login: 'author',
        id: 500,
        node_id: '',
        avatar_url: '',
        gravatar_id: '',
        url: '',
        html_url: '',
        followers_url: '',
        following_url: '',
        gists_url: '',
        starred_url: '',
        subscriptions_url: '',
        organizations_url: '',
        repos_url: '',
        events_url: '',
        received_events_url: '',
        type: 'User',
        site_admin: false,
    },
    ...overrides,
});

let pullRequestModule: typeof import('./pullRequest');

describe('importPullRequest', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        pullRequestModule = await import('./pullRequest');
    });

    it('inserts repository owner, repository, author, and pull request row', async () => {
        const expectedPr = {
            integrationId: 'int-1',
            repositoryId: 200,
            id: 1001,
            number: 42,
            state: 'open',
            title: 'Add new feature',
            body: 'PR body text',
            headBranch: 'feature-branch',
            baseBranch: 'main',
            authorId: 500,
            draft: false,
            merged: null,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-02T00:00:00Z'),
            closedAt: null,
            mergedAt: null,
        };

        const tx = buildMockTx(expectedPr);
        const event = buildPullRequestEvent();

        const result = await pullRequestModule.importPullRequest('int-1', event, tx as any);

        expect(result.pullRequest).toEqual(expectedPr);
        expect(result.user.id).toBe(500);
        expect(result.user.login).toBe('author');
        expect(result.enterprise).toBeUndefined();
        expect(result.organization).toBeUndefined();
        // insert called for: repository, users (bulk: owner + author), and pull request itself
        expect(tx.insert).toHaveBeenCalledTimes(3);
    });

    it('inserts organization when present in the event', async () => {
        const expectedPr = {
            integrationId: 'int-1',
            repositoryId: 200,
            id: 1001,
            number: 42,
            state: 'open',
            title: 'Add new feature',
            body: 'PR body text',
            headBranch: 'feature-branch',
            baseBranch: 'main',
            authorId: 500,
            draft: false,
            merged: null,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-02T00:00:00Z'),
            closedAt: null,
            mergedAt: null,
        };

        const tx = buildMockTx(expectedPr, {withOrganization: true});

        const event = buildPullRequestEvent({
            organization: {
                login: 'my-org',
                id: 999,
                node_id: '',
                url: '',
                repos_url: '',
                events_url: '',
                hooks_url: '',
                issues_url: '',
                members_url: '',
                public_members_url: '',
                avatar_url: '',
                description: null,
            },
        });

        const result = await pullRequestModule.importPullRequest('int-1', event, tx as any);

        expect(result.organization).toBeDefined();
        expect(result.organization.id).toBe(999);
        expect(result.organization.login).toBe('my-org');
        // insert called for: org, repository, users (bulk: owner + author), and pull request itself
        expect(tx.insert).toHaveBeenCalledTimes(4);
    });

    it('handles closed and merged pull requests', async () => {
        const closedAt = '2026-01-03T12:00:00Z';
        const mergedAt = '2026-01-03T12:00:00Z';

        const expectedPr = {
            integrationId: 'int-1',
            repositoryId: 200,
            id: 1001,
            number: 42,
            state: 'closed',
            title: 'Add new feature',
            body: 'PR body text',
            headBranch: 'feature-branch',
            baseBranch: 'main',
            authorId: 500,
            draft: false,
            merged: true,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-02T00:00:00Z'),
            closedAt: new Date(closedAt),
            mergedAt: new Date(mergedAt),
        };

        const tx = buildMockTx(expectedPr);

        const baseEvent = buildPullRequestEvent();
        const event = {
            ...baseEvent,
            pull_request: {
                ...baseEvent.pull_request,
                state: 'closed' as const,
                merged: true,
                closed_at: closedAt,
                merged_at: mergedAt,
            },
        } as any;

        const result = await pullRequestModule.importPullRequest('int-1', event, tx as any);

        expect(result.pullRequest.state).toBe('closed');
        expect(result.pullRequest.merged).toBe(true);
        expect(result.pullRequest.closedAt).toEqual(new Date(closedAt));
        expect(result.pullRequest.mergedAt).toEqual(new Date(mergedAt));
    });
});
