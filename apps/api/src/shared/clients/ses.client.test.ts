import {beforeEach, describe, expect, it, vi} from 'vitest';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-sesv2', () => {
    return {
        SESv2Client: class {
            send(...args: unknown[]) {
                return mockSend(...args);
            }
        },
        SendEmailCommand: class {
            constructor(public params: unknown) {}
        },
    };
});

vi.mock('@/shared/config', () => ({
    default: {
        get: vi.fn((key: string) => {
            if (key === 'sesConfig')
                return {
                    fromEmail: process.env.SES_FROM_EMAIL || '',
                    configurationSet: process.env.SES_CONFIGURATION_SET || '',
                    appUrl: 'https://app.gitgazer.com',
                    emailEnabled: true,
                };
            return '';
        }),
    },
}));

import {sendInvitationEmail} from './ses.client';

describe('ses.client', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mockSend.mockReset();
        delete process.env.SES_FROM_EMAIL;
        delete process.env.SES_CONFIGURATION_SET;
    });

    const defaultParams = {
        recipientEmail: 'user@example.com',
        inviterName: 'Sarah Chen',
        integrationLabel: 'My Project',
        role: 'member',
        inviteToken: 'abc-123',
    };

    it('sends an invitation email via SES', async () => {
        process.env.SES_FROM_EMAIL = 'noreply@app.gitgazer.com';
        process.env.SES_CONFIGURATION_SET = 'gitgazer-prod';

        await sendInvitationEmail(defaultParams);

        expect(mockSend).toHaveBeenCalledOnce();
        const command = mockSend.mock.calls[0][0];
        expect(command.params.FromEmailAddress).toBe('GitGazer <noreply@app.gitgazer.com>');
        expect(command.params.Destination.ToAddresses).toEqual(['user@example.com']);
        expect(command.params.Content.Simple.Subject.Data).toContain('Sarah Chen');
        expect(command.params.Content.Simple.Subject.Data).toContain('My Project');
        expect(command.params.Content.Simple.Body.Html.Data).toContain('abc-123');
        expect(command.params.Content.Simple.Body.Text.Data).toContain('abc-123');
        expect(command.params.ConfigurationSetName).toBe('gitgazer-prod');
    });

    it('skips sending when SES_FROM_EMAIL is not set', async () => {
        await sendInvitationEmail(defaultParams);

        expect(mockSend).not.toHaveBeenCalled();
    });

    it('sends without configuration set when not configured', async () => {
        process.env.SES_FROM_EMAIL = 'noreply@app.gitgazer.com';

        await sendInvitationEmail(defaultParams);

        expect(mockSend).toHaveBeenCalledOnce();
        const command = mockSend.mock.calls[0][0];
        expect(command.params.ConfigurationSetName).toBeUndefined();
    });

    it('escapes HTML in user-provided content', async () => {
        process.env.SES_FROM_EMAIL = 'noreply@app.gitgazer.com';

        await sendInvitationEmail({
            ...defaultParams,
            inviterName: '<script>alert("xss")</script>',
            integrationLabel: 'Project & "Test" with \'quotes\'',
        });

        const command = mockSend.mock.calls[0][0];
        const html = command.params.Content.Simple.Body.Html.Data;
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('Project &amp; &quot;Test&quot; with &#39;quotes&#39;');
    });
});
