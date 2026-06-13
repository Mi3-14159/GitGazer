import {upsertPullRequestReviews, upsertUsers} from '@/domains/webhooks/importers/shared';
import {getLogger} from '@/shared/logger';
import {RdsTransaction} from '@gitgazer/db/client';
import {PullRequestReview, PullRequestReviewEvent, UserSelect} from '@gitgazer/db/types';

const logger = getLogger();

export const importPullRequestReview = async (
    integrationId: string,
    event: PullRequestReviewEvent,
    tx: RdsTransaction,
): Promise<{
    pullRequestReview: PullRequestReview;
    user: UserSelect | null;
}> => {
    const review = event.review;

    if (!review.submitted_at) {
        throw new Error(`Review ${review.id} has no submitted_at timestamp`);
    }

    // GitHub sends `user: null` when the reviewer's account has been deleted,
    // even though @octokit/webhooks-types declares `review.user` as non-null.
    const reviewer = review.user as typeof review.user | null;

    const submittedAt = new Date(review.submitted_at);

    let user: UserSelect | null = null;
    if (reviewer) {
        const {users} = await upsertUsers(tx, [{integrationId, id: reviewer.id, login: reviewer.login, type: reviewer.type}]);
        user = users.find((u) => u.id === reviewer.id) ?? null;
    } else {
        logger.info(`Review ${review.id} has no reviewer (account may be deleted)`, {
            integrationId,
            reviewId: review.id,
            pullRequestNumber: event.pull_request.number,
            repositoryName: event.repository.name,
        });
    }

    const {pullRequestReviews} = await upsertPullRequestReviews(tx, [
        {
            integrationId,
            id: review.id,
            pullRequestId: event.pull_request.id,
            repositoryId: event.repository.id,
            userId: reviewer?.id ?? null,
            state: review.state,
            submittedAt,
            body: review.body ?? null,
        },
    ]);

    return {
        pullRequestReview: pullRequestReviews[0],
        user,
    };
};
