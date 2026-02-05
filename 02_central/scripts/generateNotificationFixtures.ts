#!/usr/bin/env node
/**
 * Script to generate N notification rules for a specific integration and write them to DynamoDB
 *
 * Usage:
 *   npm run ts-node scripts/generateNotificationFixtures.ts <integrationId> <count>
 *
 * Example:
 *   npm run ts-node scripts/generateNotificationFixtures.ts my-integration-id 10
 */

import {putNotificationRule} from '@/clients/dynamodb';
import {getLogger} from '@/logger';
import {NotificationRule, NotificationRuleChannelType} from '@common/types';

const logger = getLogger();

// Sample data for generating varied notification rules
const owners = ['microsoft', 'google', 'facebook', 'amazon', 'apple', 'netflix'];
const repositories = ['vscode', 'react', 'kubernetes', 'tensorflow', 'pytorch', 'aws-sdk'];
const workflows = ['CI', 'Build', 'Test', 'Deploy', 'Release', 'Lint', 'Security Scan'];
const branches = ['main', 'develop', 'staging', 'production', 'feature/*', 'release/*'];
const webhookUrls = [
    'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX',
    'https://hooks.slack.com/services/T11111111/B11111111/YYYYYYYYYYYYYYYYYYYY',
    'https://hooks.slack.com/services/T22222222/B22222222/ZZZZZZZZZZZZZZZZZZZZ',
];

/**
 * Generate a random notification rule
 */
function generateNotificationRule(integrationId: string, index: number): Omit<NotificationRule, 'createdAt' | 'updatedAt'> {
    const enabledOptions = [true, true, true, false]; // 75% chance of being enabled
    const ignoreDependabotOptions = [true, false, false, false]; // 25% chance of ignoring dependabot

    return {
        id: crypto.randomUUID(),
        integrationId,
        enabled: enabledOptions[index % enabledOptions.length],
        ignore_dependabot: ignoreDependabotOptions[index % ignoreDependabotOptions.length],
        channels: [
            {
                type: NotificationRuleChannelType.SLACK,
                webhook_url: webhookUrls[index % webhookUrls.length],
            },
        ],
        rule: {
            owner: owners[index % owners.length],
            repository_name: repositories[index % repositories.length],
            workflow_name: workflows[index % workflows.length],
            head_branch: branches[index % branches.length],
        },
    };
}

/**
 * Main function to generate and write notification rules to DynamoDB
 */
async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        logger.error('Usage: npm run ts-node scripts/generateNotificationFixtures.ts <integrationId> <count>');
        logger.error('Example: npm run ts-node scripts/generateNotificationFixtures.ts my-integration-id 10');
        process.exit(1);
    }

    const [integrationId, countStr] = args;
    const count = parseInt(countStr, 10);

    if (isNaN(count) || count <= 0) {
        logger.error('Count must be a positive number');
        process.exit(1);
    }

    logger.info(`Generating ${count} notification rules for integration: ${integrationId}`);

    const results = {
        success: 0,
        failed: 0,
        errors: [] as string[],
    };

    // Generate and write rules to DynamoDB
    for (let i = 0; i < count; i++) {
        try {
            const rule = generateNotificationRule(integrationId, i);
            logger.info(`Creating notification rule ${i + 1}/${count}`, {
                ruleId: rule.id,
                owner: rule.rule.owner,
                repository: rule.rule.repository_name,
                workflow: rule.rule.workflow_name,
            });

            await putNotificationRule(rule, true);
            results.success++;

            logger.info(`✓ Successfully created notification rule ${i + 1}/${count}`, {ruleId: rule.id});
        } catch (error) {
            results.failed++;
            const errorMessage = error instanceof Error ? error.message : String(error);
            results.errors.push(`Rule ${i + 1}: ${errorMessage}`);
            logger.error(`✗ Failed to create notification rule ${i + 1}/${count}`, {error: errorMessage});
        }
    }

    // Summary
    logger.info('\n=== Summary ===');
    logger.info(`Total rules to create: ${count}`);
    logger.info(`Successfully created: ${results.success}`);
    logger.info(`Failed: ${results.failed}`);

    if (results.errors.length > 0) {
        logger.error('\nErrors:');
        results.errors.forEach((error) => logger.error(`  - ${error}`));
        process.exit(1);
    }

    logger.info('\n✓ All notification rules created successfully!');
}

// Run the script
main().catch((error) => {
    logger.error('Fatal error:', {error: error instanceof Error ? error.message : String(error)});
    process.exit(1);
});
