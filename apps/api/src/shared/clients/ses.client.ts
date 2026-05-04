import config from '@/shared/config';
import {getLogger} from '@/shared/logger';
import {SESv2Client, SendEmailCommand} from '@aws-sdk/client-sesv2';

const client = new SESv2Client({useDualstackEndpoint: true});

export interface InvitationEmailParams {
    recipientEmail: string;
    inviterName: string;
    integrationLabel: string;
    role: string;
    inviteToken: string;
}

const buildInvitationHtml = (params: InvitationEmailParams, appUrl: string): string => {
    const acceptUrl = `${appUrl}/invite/${encodeURIComponent(params.inviteToken)}`;

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
        <tr><td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px 40px">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:600">GitGazer</h1>
        </td></tr>
        <tr><td style="padding:32px 40px">
          <h2 style="margin:0 0 16px;color:#18181b;font-size:20px;font-weight:600">You've been invited!</h2>
          <p style="margin:0 0 24px;color:#3f3f46;font-size:15px;line-height:1.6">
            <strong>${escapeHtml(params.inviterName)}</strong> has invited you to join
            <strong>${escapeHtml(params.integrationLabel)}</strong> as a <strong>${escapeHtml(params.role)}</strong>.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr><td>
            <a href="${escapeHtml(acceptUrl)}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:600">
              Accept Invitation
            </a>
          </td></tr></table>
          <p style="margin:0 0 8px;color:#71717a;font-size:13px;line-height:1.5">
            Or copy and paste this URL into your browser:
          </p>
          <p style="margin:0 0 24px;color:#6366f1;font-size:13px;word-break:break-all">
            ${escapeHtml(acceptUrl)}
          </p>
          <hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0">
          <p style="margin:0;color:#a1a1aa;font-size:12px;line-height:1.5">
            This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
};

const buildInvitationText = (params: InvitationEmailParams, appUrl: string): string => {
    const acceptUrl = `${appUrl}/invite/${encodeURIComponent(params.inviteToken)}`;

    return [
        `You've been invited to GitGazer!`,
        ``,
        `${params.inviterName} has invited you to join "${params.integrationLabel}" as a ${params.role}.`,
        ``,
        `Accept the invitation here:`,
        acceptUrl,
        ``,
        `This invitation expires in 7 days.`,
        `If you didn't expect this email, you can safely ignore it.`,
    ].join('\n');
};

const escapeHtml = (str: string): string =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const sendInvitationEmail = async (params: InvitationEmailParams): Promise<void> => {
    const logger = getLogger();
    const {fromEmail, configurationSet, appUrl} = config.get('sesConfig');

    if (!fromEmail) {
        logger.warn('SES_FROM_EMAIL not configured — skipping invitation email');
        return;
    }

    if (!appUrl) {
        logger.warn('No frontend origin configured — skipping invitation email');
        return;
    }

    const subject = `${params.inviterName} invited you to ${params.integrationLabel} on GitGazer`;

    logger.info('Sending invitation email', {recipientEmail: params.recipientEmail, integrationLabel: params.integrationLabel});

    await client.send(
        new SendEmailCommand({
            FromEmailAddress: `GitGazer <${fromEmail}>`,
            Destination: {
                ToAddresses: [params.recipientEmail],
            },
            Content: {
                Simple: {
                    Subject: {Data: subject, Charset: 'UTF-8'},
                    Body: {
                        Html: {Data: buildInvitationHtml(params, appUrl), Charset: 'UTF-8'},
                        Text: {Data: buildInvitationText(params, appUrl), Charset: 'UTF-8'},
                    },
                },
            },
            ...(configurationSet ? {ConfigurationSetName: configurationSet} : {}),
        }),
    );

    logger.info('Invitation email sent successfully', {recipientEmail: params.recipientEmail});
};
