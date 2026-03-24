import {RdsTransaction} from '@gitgazer/db/client';
import {pullRequestReviews, user} from '@gitgazer/db/schema/github/workflows';
import {PullRequestReviewEvent} from '@gitgazer/db/types';
import {InferSelectModel} from 'drizzle-orm/table';
import {upsertUsers} from './shared';

export const importPullRequestReview = async (
    integrationId: string,
    event: PullRequestReviewEvent,
    tx: RdsTransaction,
): Promise<{
    pullRequestReview: InferSelectModel<typeof pullRequestReviews>;
    user: InferSelectModel<typeof user>;
}> => {
    const review = event.review;

    if (!review.submitted_at) {
        throw new Error(`Review ${review.id} has no submitted_at timestamp`);
    }

    const submittedAt = new Date(review.submitted_at);
    const userMap = await upsertUsers(tx, integrationId, [{id: review.user.id, login: review.user.login, type: review.user.type}]);

    const result = await tx
        .insert(pullRequestReviews)
        .values({
            integrationId,
            id: review.id,
            pullRequestId: event.pull_request.id,
            repositoryId: event.repository.id,
            userId: review.user.id,
            state: review.state,
            submittedAt,
            body: review.body ?? null,
        })
        .onConflictDoUpdate({
            target: [pullRequestReviews.integrationId, pullRequestReviews.id],
            set: {
                state: review.state,
                body: review.body ?? null,
                submittedAt,
            },
        })
        .returning();

    return {
        pullRequestReview: result[0],
        user: userMap.get(review.user.id)!,
    };
};
