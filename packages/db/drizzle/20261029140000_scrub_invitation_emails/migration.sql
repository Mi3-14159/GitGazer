-- Custom SQL migration file, put your code below! --
UPDATE gitgazer.event_log_entries
SET message = CASE
        WHEN metadata ? 'role' THEN 'Invitation created with role "' || (metadata->>'role') || '"'
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
UPDATE gitgazer.event_log_entries
SET message = regexp_replace(message, '^\S+@\S+', 'User ' || (metadata->>'targetUserId'))
WHERE category = 'integration'
    AND title IN ('Member role changed', 'Member removed', 'Member left', 'Invitation accepted')
    AND metadata ? 'targetUserId'
    AND message ~ '^\S+@\S+';
