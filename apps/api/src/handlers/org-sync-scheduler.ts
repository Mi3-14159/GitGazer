import {sendOrgMemberSyncTask} from '@/shared/clients/sqs.client';
import config, {loadConfig} from '@/shared/config';
import {getLogger} from '@/shared/logger';
import {db, initDb} from '@gitgazer/db/client';
import {githubAppInstallations} from '@gitgazer/db/schema/github/workflows';
import {eq} from 'drizzle-orm';

const logger = getLogger();
let initPromise: Promise<void> | null = null;

const init = async (): Promise<void> => {
    await initDb();
    await loadConfig();
};

/**
 * Scheduled Lambda handler (triggered by EventBridge).
 * Queries all GitHub App installations with account_type = 'Organization'
 * and dispatches an org_member_sync SQS message for each one.
 *
 * The worker Lambda picks up each task and performs the full sync,
 * reusing the same syncOrgMembers logic from Phase 2.
 */
export const handler = async (): Promise<void> => {
    if (!initPromise) {
        initPromise = init();
    }
    await initPromise;

    const queueUrl = config.get('webhookQueueUrl');

    const orgInstallations = await db
        .select({
            installationId: githubAppInstallations.installationId,
            accountLogin: githubAppInstallations.accountLogin,
        })
        .from(githubAppInstallations)
        .where(eq(githubAppInstallations.accountType, 'Organization'));

    logger.info('Dispatching periodic org member sync', {installationCount: orgInstallations.length});

    let dispatched = 0;
    let failed = 0;

    for (const installation of orgInstallations) {
        try {
            await sendOrgMemberSyncTask(queueUrl, {
                taskType: 'org_member_sync',
                installationId: installation.installationId,
                accountLogin: installation.accountLogin,
            });
            dispatched++;
        } catch (error) {
            failed++;
            logger.error('Failed to dispatch org member sync', {
                installationId: installation.installationId,
                accountLogin: installation.accountLogin,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    logger.info('Periodic org member sync dispatch completed', {dispatched, failed, total: orgInstallations.length});
};
