---
sidebar_position: 6
title: Managing Team Members
description: Invite teammates, assign roles, and manage access to your integrations.
---

# Managing Team Members

Each integration has its own set of members with role-based access. You can invite teammates, change their roles, and remove them as needed.

## Roles

GitGazer uses four roles, from most to least privileged:

| Role       | Icon   | Capabilities                                                           |
| ---------- | ------ | ---------------------------------------------------------------------- |
| **Owner**  | Crown  | Full control, including deleting the integration. One per integration. |
| **Admin**  | Shield | Manage members, invitations, integration settings, and webhook events. |
| **Member** | Cog    | Create notification rules, view workflows and invitations.             |
| **Viewer** | Eye    | Read-only access to workflows and integration details.                 |

Higher roles inherit all capabilities of lower roles.

## Open the Members Page

1. Go to the **Integrations** page.
2. Click an integration to open it, then select the **Members** tab.
3. You'll see the member list with a member list and any pending invitations.

A stats bar shows the total member count and number of pending invitations.

## Invite a Member

_Requires **admin** role or higher._

1. Click **Invite Member** in the page header.
2. Choose a role: **Admin**, **Member**, or **Viewer**.
3. Choose a delivery method:
    - **Send Email Invitation** — enter the invitee's email address and click **Send**. They receive an email with an invite link.
    - **Generate Invite Link** — click **Generate** to create a shareable link. Copy it and send it yourself.
4. The invitation appears in the **Pending Invitations** section.

Invitations expire after **7 days**. You can resend or revoke them at any time.

:::info[Link-only invitations]

If you generate an invite link without an email, anyone with the link can accept it. Share it only with the intended recipient.

:::

### Accepting an Invitation

When someone opens an invite link (`/invite/:token`):

1. If they're not signed in, they're redirected to sign in with GitHub first.
2. After authentication, the invitation is accepted automatically.
3. They appear as a member with the role specified in the invitation.

## Change a Member's Role

_Requires **admin** role or higher._

1. Click the role dropdown on a member's card.
2. Select the new role.

Restrictions:

- You cannot change your own role.
- Only the **owner** can promote someone to admin or change an admin's role.
- Admins can change roles of members and viewers.
- The owner role cannot be assigned via this dropdown.

## Remove a Member

_Requires **admin** role or higher._

1. Click the **remove** button on a member's card.
2. Confirm in the dialog.

Restrictions:

- The **owner** cannot be removed.
- Only the **owner** can remove admins.
- Admins can remove members and viewers.
- You cannot remove yourself — use **Leave** instead.

## Leave an Integration

Any member except the owner can leave an integration:

1. Go to the **Integrations** page.
2. Open the integration and select the **Settings** tab.
3. Click **Leave**.

Once you leave, you'll need an admin to re-invite you if you want access again.

The **owner** cannot leave — transfer ownership first by promoting another member to owner.

## Manage Pending Invitations

_Requires **admin** role or higher._

Pending invitation cards show the invitee's email (or "Link-only invitation"), who invited them, the assigned role, and a status badge.

Available actions:

| Action               | Description                                                     |
| -------------------- | --------------------------------------------------------------- |
| **Copy Invite Link** | Copy the invitation URL to share manually.                      |
| **Resend Email**     | Re-send the invitation email and reset the 7-day expiry window. |
| **Revoke**           | Cancel the invitation permanently.                              |

**Resend Email** is only available for invitations that include an email address.

## Organization Sync

When a GitHub App installation is linked to an integration, GitGazer can automatically sync organization members. Members who sign in to GitGazer are added to the integration with a configurable default role.

To set the default role for auto-synced members:

1. Open the integration, select the **Apps** tab, and open the **GitHub** app.
2. Under **Org Sync Default Role**, choose **Viewer**, **Member**, or **Admin**.

_Requires **admin** role or higher._ See [Setting Up Integrations](integrations#org-sync-default-role) for details.

## Slack Link

If the integration has the [Slack app](slack-app) installed, each member shows a **Slack** badge when their GitHub account is linked to a Slack user. You see whether someone is linked, never their Slack ID.

On your own row, click **Connect Slack** to link yourself, or **Disconnect** to remove the link. Only you can do this for your own account. While you aren't linked, the integration page also shows a prompt with a **Connect Slack** button.

## Searching Members

Use the search bar at the top of the **Members** tab to filter:

- **Members** by name or email.
- **Pending invitations** by email or inviter name.
