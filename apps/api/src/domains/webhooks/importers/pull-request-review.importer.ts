import {upsertPullRequestReviews, upsertUsers} from '@/domains/webhooks/importers/shared';
import {RdsTransaction} from '@gitgazer/db/client';
import {PullRequestReview, PullRequestReviewEvent, UserSelect} from '@gitgazer/db/types';
export const importPullRequestReview = async (
    integrationId: string,
    event: PullRequestReviewEvent,
    tx: RdsTransaction,
): Promise<{
    pullRequestReview: PullRequestReview;
    user: UserSelect;
}> => {
    const review = event.review;

    if (!review.submitted_at) {
        throw new Error(`Review ${review.id} has no submitted_at timestamp`);
    }

    const submittedAt = new Date(review.submitted_at);
    const {users} = await upsertUsers(tx, [{integrationId, id: review.user.id, login: review.user.login, type: review.user.type}]);

    const {pullRequestReviews} = await upsertPullRequestReviews(tx, [
        {
            integrationId,
            id: review.id,
            pullRequestId: event.pull_request.id,
            repositoryId: event.repository.id,
            userId: review.user.id,
            state: review.state,
            submittedAt,
            body: review.body ?? null,
        },
    ]);

    return {
        pullRequestReview: pullRequestReviews[0],
        user: users.find((u) => u.id === review.user.id)!,
    };
};
