-- Custom SQL migration file, put your code below! --
UPDATE gitgazer.event_log_entries
SET message = CASE
        WHEN metadata->>'role' IS NOT NULL THEN 'Invitation created with role "' || (metadata->>'role') || '"'
        ELSE 'Invitation created'
    END,
    metadata = metadata - 'targetEmail'
WHERE category = 'integration' AND title = 'Invitation created';
--> statement-breakpoint
UPDATE gitgazer.event_log_entries
SET message = 'An invitation was revoked', metadata = metadata - 'targetEmail'
WHERE category = 'integration' AND title = 'Invitation revoked';
--> statement-breakpoint
UPDATE gitgazer.event_log_entries
SET message = 'An invitation was resent', metadata = metadata - 'targetEmail'
WHERE category = 'integration' AND title = 'Invitation resent';
--> statement-breakpoint
-- The regex guards the bigint cast against a non-numeric targetUserId
UPDATE gitgazer.event_log_entries
SET message = regexp_replace(
    message,
    '^\S+@\S+',
    coalesce(
        (SELECT u.github_login FROM gitgazer.users u WHERE metadata->>'targetUserId' ~ '^[0-9]{1,18}$' AND u.id = (metadata->>'targetUserId')::bigint),
        'User ' || (metadata->>'targetUserId'),
        'A member'
    )
)
WHERE category = 'integration'
    AND title IN ('Member role changed', 'Member removed', 'Member left', 'Invitation accepted')
    AND message ~ '^\S+@\S+';
