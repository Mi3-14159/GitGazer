---
applies_to:
  - "common/**/*.ts"
  - "common/**/*.json"
---

# Common Module Instructions

This module contains shared TypeScript types and utilities used across all GitGazer modules.

## Overview

The `common` module provides:
- Shared TypeScript type definitions
- Type guard functions
- Common utilities
- Consistent type safety across backend and frontend

## Build Commands

```bash
cd common

# Install dependencies
npm ci

# Build TypeScript
npm run build

# Watch mode for development
npm run build:watch
```

## Module Structure

```
common/
├── src/
│   ├── types/
│   │   └── index.ts    # All type definitions
│   └── index.ts        # Main exports
├── package.json
└── tsconfig.json
```

## Type Definitions

All types are defined in `src/types/index.ts` and exported from the module root.

### Type Categories

1. **GitHub Event Types**
   - `WorkflowJobEvent`: GitHub workflow job webhook payload
   - `WorkflowRunEvent`: GitHub workflow run webhook payload
   - Related enums and interfaces

2. **API Types**
   - Request/response types for API endpoints
   - Query parameter types
   - Error response types

3. **Database Types**
   - DynamoDB entity types
   - Table schema types
   - Query/scan result types

4. **Notification Types**
   - `NotificationRule`: Notification configuration
   - `NotificationRuleChannelType`: Supported notification channels
   - Channel-specific configuration types

5. **Integration Types**
   - GitHub integration configuration
   - OAuth tokens
   - Webhook secrets

## Type Guards

Every type has a corresponding type guard function prefixed with `is`:

```typescript
// Type definition
export interface WorkflowJobEvent {
  action: string
  workflow_job: object
  // ...
}

// Type guard
export function isWorkflowJobEvent(obj: unknown): obj is WorkflowJobEvent {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'action' in obj &&
    'workflow_job' in obj
  )
}
```

### Using Type Guards

Always use type guards when validating external data:

```typescript
import { isWorkflowJobEvent, type WorkflowJobEvent } from 'common'

function handleWebhook(data: unknown) {
  if (isWorkflowJobEvent(data)) {
    // TypeScript knows data is WorkflowJobEvent
    processJob(data.workflow_job)
  } else {
    throw new Error('Invalid webhook payload')
  }
}
```

## Development Patterns

### Adding New Types

1. Define the interface/type in `src/types/index.ts`
2. Create corresponding type guard function
3. Export from module root
4. Document the type with JSDoc comments

Example:
```typescript
/**
 * Represents a user profile
 */
export interface UserProfile {
  id: string
  email: string
  name: string
  createdAt: string
}

/**
 * Type guard for UserProfile
 */
export function isUserProfile(obj: unknown): obj is UserProfile {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    typeof (obj as UserProfile).id === 'string' &&
    'email' in obj &&
    typeof (obj as UserProfile).email === 'string' &&
    'name' in obj &&
    typeof (obj as UserProfile).name === 'string' &&
    'createdAt' in obj &&
    typeof (obj as UserProfile).createdAt === 'string'
  )
}
```

### Enums

Use TypeScript enums for fixed sets of values:

```typescript
export enum NotificationRuleChannelType {
  EMAIL = 'email',
  SLACK = 'slack',
  WEBHOOK = 'webhook',
}
```

### Type Unions

Use type unions for discriminated unions:

```typescript
export type NotificationChannel =
  | EmailChannel
  | SlackChannel
  | WebhookChannel

interface EmailChannel {
  type: 'email'
  address: string
}

interface SlackChannel {
  type: 'slack'
  webhookUrl: string
}

interface WebhookChannel {
  type: 'webhook'
  url: string
}
```

## Consuming the Module

### In Backend (02_central)

```typescript
import type { WorkflowJobEvent, NotificationRule } from 'common'
import { isWorkflowJobEvent, NotificationRuleChannelType } from 'common'

function processEvent(event: WorkflowJobEvent) {
  // Use the type
}

function validateEvent(data: unknown) {
  if (isWorkflowJobEvent(data)) {
    processEvent(data)
  }
}
```

### In Frontend (04_frontend)

```typescript
import type { NotificationRule, Integration } from 'common'

interface Props {
  rule: NotificationRule
  integration: Integration
}
```

## Version Management

The common module version should be updated when:
- Breaking changes to type definitions
- New types are added
- Type guards are modified

### Semantic Versioning
- **Major**: Breaking changes to existing types
- **Minor**: New types or non-breaking additions
- **Patch**: Bug fixes, documentation

### Updating Dependent Modules

After updating common types:

1. Update `common` version in `package.json`
2. Run `npm install` in dependent modules:
   ```bash
   cd 02_central && npm install
   cd ../04_frontend && npm install
   ```
3. Fix any type errors in dependent code
4. Test thoroughly

## Best Practices

### Type Safety
- Use explicit types, avoid `any`
- Prefer interfaces over type aliases for objects
- Use readonly for immutable properties
- Document complex types with JSDoc

### Type Guards
- Keep type guards simple and maintainable
- Test all properties that define the type
- Use runtime validation for external data
- Don't assume object structure

### Naming Conventions
- PascalCase for types and interfaces
- camelCase for type guard functions
- Prefix type guards with `is`
- Use descriptive names

### Documentation
- Add JSDoc comments to all exported types
- Explain purpose and usage
- Document complex properties
- Include examples when helpful

## Testing

Type guards should be tested:

```typescript
import { describe, it, expect } from 'vitest'
import { isUserProfile } from './types'

describe('isUserProfile', () => {
  it('returns true for valid UserProfile', () => {
    const valid = {
      id: '123',
      email: 'user@example.com',
      name: 'Test User',
      createdAt: '2024-01-01T00:00:00Z'
    }
    expect(isUserProfile(valid)).toBe(true)
  })

  it('returns false for invalid data', () => {
    expect(isUserProfile(null)).toBe(false)
    expect(isUserProfile({})).toBe(false)
    expect(isUserProfile({ id: 123 })).toBe(false)
  })
})
```

## Important Notes

- This module is consumed by both backend and frontend
- Changes here affect all modules - be careful with breaking changes
- Always create type guards for runtime validation
- Keep the module focused on types - no business logic
- Use TypeScript strict mode
- Maintain backward compatibility when possible
- Document all exports clearly
- Consider impact on dependent modules
