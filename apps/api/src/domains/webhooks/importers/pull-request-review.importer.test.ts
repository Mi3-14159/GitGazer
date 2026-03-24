import type {PullRequestReviewSubmittedEvent} from '@octokit/webhooks-types';
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockUser = Symbol('user');
const mockPullRequestReviews = Symbol('pullRequestReviews');

vi.mock('@gitgazer/db/schema/github/workflows', () => ({
    user: mockUser,
    pullRequestReviews: mockPullRequestReviews,
}));

const buildMockTx = (returnedReview: any) => {
    let currentTable: symbol | null = null;

    const mockUsers = [{integrationId: 'int-1', id: 700, login: 'reviewer', type: 'User'}];

    const returning = vi.fn(() => {
        if (currentTable === mockPullRequestReviews) {
            return Promise.resolve([returnedReview]);
        }
        if (currentTable === mockUser) {
            return Promise.resolve(mockUsers);
        }
        return Promise.resolve([]);
    });

    const onConflictDoNothing = vi.fn(() => ({returning}));
    const onConflictDoUpdate = vi.fn(() => ({returning}));

    const values = vi.fn(() => ({
        onConflictDoNothing,
        onConflictDoUpdate,
    }));

    const selectWithoutLimit = Object.assign(
        vi.fn(() => Promise.resolve(mockUsers)),
        {where: vi.fn(() => ({limit: vi.fn(() => Promise.resolve(mockUsers))}))},
    );

    const fromMock = vi.fn((table: symbol) => {
        currentTable = table;
        return selectWithoutLimit;
    });

    return {
        insert: vi.fn((table: symbol) => {
            currentTable = table;
            return {values};
        }),
        select: vi.fn(() => ({from: fromMock})),
        _onConflictDoUpdate: onConflictDoUpdate,
        _returning: returning,
    };
};

const buildReviewEvent = (overrides: Partial<PullRequestReviewSubmittedEvent> = {}): PullRequestReviewSubmittedEvent => {
    const baseUser = {
        login: 'reviewer',
        id: 700,
        node_id: 'U_reviewer',
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
        type: 'User' as const,
        site_admin: false,
    };

    return {
        action: 'submitted',
        review: {
            id: 5001,
            node_id: 'PRR_node',
            user: baseUser,
            body: 'Looks good!',
            commit_id: 'abc123',
            submitted_at: '2026-01-02T10:00:00Z',
            state: 'approved',
            html_url: '',
            pull_request_url: '',
            author_association: 'MEMBER',
            _links: {
                html: {href: ''},
                pull_request: {href: ''},
            },
        },
        pull_request: {
            url: '',
            id: 1001,
            node_id: 'PR_node',
            html_url: '',
            diff_url: '',
            patch_url: '',
            issue_url: '',
            number: 42,
            state: 'open',
            locked: false,
            title: 'Add feature',
            user: baseUser,
            body: '',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-02T10:00:00Z',
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
                label: 'owner:feature',
                ref: 'feature',
                sha: 'abc123',
                user: baseUser,
                repo: null,
            },
            base: {
                label: 'owner:main',
                ref: 'main',
                sha: 'def456',
                user: baseUser,
                repo: null,
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
            author_association: 'MEMBER',
            auto_merge: null,
            active_lock_reason: null,
            draft: false,
        },
        repository: {
            id: 200,
            node_id: 'R_node',
            name: 'repo',
            full_name: 'owner/repo',
            private: false,
            owner: baseUser,
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
        sender: baseUser,
        ...overrides,
    } as PullRequestReviewSubmittedEvent;
};

let reviewModule: typeof import('./pull-request-review.importer');

describe('importPullRequestReview', () => {
    beforeEach(async () => {
        vi.restoreAllMocks();
        reviewModule = await import('./pull-request-review.importer');
    });

    it('upserts user and inserts review row', async () => {
        const expectedReview = {
            integrationId: 'int-1',
            id: 5001,
            pullRequestId: 1001,
            repositoryId: 200,
            userId: 700,
            state: 'approved',
            submittedAt: new Date('2026-01-02T10:00:00Z'),
            body: 'Looks good!',
        };

        const tx = buildMockTx(expectedReview);
        const event = buildReviewEvent();

        const result = await reviewModule.importPullRequestReview('int-1', event, tx as any);

        expect(result.pullRequestReview).toEqual(expectedReview);
        expect(result.user.id).toBe(700);
        expect(result.user.login).toBe('reviewer');
        // insert called for: users (upsert) and review
        expect(tx.insert).toHaveBeenCalledTimes(2);
    });

    it('handles changes_requested review state', async () => {
        const expectedReview = {
            integrationId: 'int-1',
            id: 5001,
            pullRequestId: 1001,
            repositoryId: 200,
            userId: 700,
            state: 'changes_requested',
            submittedAt: new Date('2026-01-02T10:00:00Z'),
            body: 'Please fix the tests',
        };

        const tx = buildMockTx(expectedReview);
        const event = buildReviewEvent();
        (event.review as any).state = 'changes_requested';
        (event.review as any).body = 'Please fix the tests';

        const result = await reviewModule.importPullRequestReview('int-1', event, tx as any);

        expect(result.pullRequestReview.state).toBe('changes_requested');
        expect(result.pullRequestReview.body).toBe('Please fix the tests');
    });

    it('handles null body gracefully', async () => {
        const expectedReview = {
            integrationId: 'int-1',
            id: 5001,
            pullRequestId: 1001,
            repositoryId: 200,
            userId: 700,
            state: 'approved',
            submittedAt: new Date('2026-01-02T10:00:00Z'),
            body: null,
        };

        const tx = buildMockTx(expectedReview);
        const event = buildReviewEvent();
        (event.review as any).body = null;

        const result = await reviewModule.importPullRequestReview('int-1', event, tx as any);

        expect(result.pullRequestReview.body).toBeNull();
    });

    it('uses onConflictDoUpdate for idempotent upsert', async () => {
        const expectedReview = {
            integrationId: 'int-1',
            id: 5001,
            pullRequestId: 1001,
            repositoryId: 200,
            userId: 700,
            state: 'approved',
            submittedAt: new Date('2026-01-02T10:00:00Z'),
            body: 'Looks good!',
        };

        const tx = buildMockTx(expectedReview);
        const event = buildReviewEvent();

        await reviewModule.importPullRequestReview('int-1', event, tx as any);

        expect(tx._onConflictDoUpdate).toHaveBeenCalled();
    });

    it('throws when submitted_at is null', async () => {
        const tx = buildMockTx({});
        const event = buildReviewEvent();
        (event.review as any).submitted_at = null;

        await expect(reviewModule.importPullRequestReview('int-1', event, tx as any)).rejects.toThrow('has no submitted_at timestamp');
    });
});
