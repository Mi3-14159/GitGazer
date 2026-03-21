---
applyTo: 'apps/web/**/*.{vue,ts,json}'
---

# Frontend Development Instructions

This module contains the Vue 3 SPA frontend for GitGazer.

## Build and Test Commands

```bash
cd apps/web

# Install dependencies
npm ci

# Development server with hot reload
npm run dev

# Build for production
npm run build

# Type checking
vue-tsc --noEmit

# Linting and formatting
npm run lint
npm run lint:fix
npm run pretty
```

## Architecture

### Tech Stack

- **Framework**: Vue 3 with Composition API
- **UI Library**: Radix Vue (headless components) + Tailwind CSS 4
- **UI Primitives**: Class Variance Authority (CVA) for variant-based styling
- **Icons**: Lucide Vue Next
- **State Management**: Pinia
- **Router**: Vue Router 5
- **Build Tool**: Vite
- **Authentication**: httpOnly cookies with AWS Cognito
- **TypeScript**: For type safety

### Project Structure

- `src/components/`: Reusable Vue components
    - `src/components/ui/`: Base UI primitives (Button, Input, Dialog, Card, etc.)
- `src/views/`: Page-level components (routed)
- `src/router/`: Vue Router configuration
- `src/stores/`: Pinia state stores
- `src/composables/`: Reusable composition functions
- `src/api/`: API client functions
- `src/lib/`: Shared utility libraries
- `src/utils/`: Utility helper functions
- `src/types/`: TypeScript type definitions
- `src/plugins/`: Vue plugins
- `public/`: Static assets

## Development Patterns

### Component Development

- Use Composition API with `<script setup>` syntax
- Always use TypeScript for better type safety
- Use UI primitives from `src/components/ui/` (Button, Input, Card, Dialog, etc.)
- Use Tailwind CSS utility classes for styling
- Use Lucide Vue Next icons: `import { HomeIcon } from 'lucide-vue-next'`

Example:

```vue
<script setup lang="ts">
    import {ref} from 'vue';
    import type {MyType} from '@/types';
    import {Button} from '@/components/ui';

    const data = ref<MyType[]>([]);
</script>

<template>
    <div class="flex flex-col gap-4">
        <Button variant="default">Click me</Button>
    </div>
</template>
```

### State Management with Pinia

- Create stores in `src/stores/`
- Use Composition API style
- Export typed store hooks
- Keep stores focused and modular

Example:

```typescript
import {defineStore} from 'pinia';

export const useMyStore = defineStore('my-store', () => {
    const state = ref<MyType>({});

    function myAction() {
        // logic
    }

    return {state, myAction};
});
```

### Routing

- Routes defined in `src/router/`
- Use route guards for authentication
- Lazy-load components for code splitting
- Follow Vue Router 5 patterns

### API Integration

- Authentication handled via httpOnly cookies set by backend
- API calls in `src/api/` directory
- Authenticated requests automatically include cookies
- Handle errors consistently with try/catch
- WebSocket integration for real-time updates
- Use composables (e.g., `useIntegration`, `useNotification`) for API logic

### Authentication

- AWS Cognito with OAuth integration
- httpOnly cookies for secure session management
- Secure cookie-based authentication (no client-side token storage)
- Auth guards on protected routes
- CSRF protection via SameSite cookies

## Environment Configuration

### Required Environment Variables

Create `.env.local` file:

```bash
VITE_HOST_URL="https://app.gitgazer.localhost:5173"
VITE_COGNITO_DOMAIN="<COGNITO_DOMAIN>"
VITE_COGNITO_USER_POOL_ID="<USER_POOL_ID>"
VITE_COGNITO_USER_POOL_CLIENT_ID="<USER_POOL_CLIENT_ID>"
VITE_IMPORT_URL_BASE="https://<GITGAZER_DOMAIN>/v1/api/import/"
VITE_REST_API_REGION="<API_REGION>"
VITE_REST_API_ENDPOINT="https://<GITGAZER_DOMAIN>/api"
VITE_WEBSOCKET_API_ENDPOINT="<WEBSOCKET_ENDPOINT>"
```

Get these values from Terraform outputs after infrastructure deployment.

### Accessing Environment Variables

- Use `import.meta.env.VITE_*` pattern
- All public env vars must start with `VITE_`
- Type definitions in `env.d.ts`

## UI Components

### Base Primitives

- Pre-built UI components in `src/components/ui/` (Button, Input, Card, Dialog, Tabs, Badge, etc.)
- Built with Radix Vue for accessibility and Tailwind CSS for styling
- Use Class Variance Authority (CVA) for variant-based component styling
- Component variants defined with `cva()` for consistent, type-safe props

### Theming

- Tailwind CSS 4 with CSS variables for theming
- Light/dark mode via `ThemeToggle` component
- Color tokens defined as CSS custom properties in `src/assets/main.css`

### Icons

- Lucide Vue Next for icons
- Import icons as individual components: `import { HomeIcon, BellIcon } from 'lucide-vue-next'`
- Example: `<HomeIcon class="size-4" />`

## Development Workflow

### Local Development

1. Set up `.env.local` with environment variables
2. Add `app.gitgazer.localhost` to your `/etc/hosts` file pointing to `127.0.0.1`
3. Run `npm ci` to install dependencies
4. Run `npm run dev` to start dev server
5. Open `https://app.gitgazer.localhost:5173` in browser (self-signed SSL certificate)

### Hot Module Replacement (HMR)

- Vite provides fast HMR
- Changes reflected immediately
- CSS and component updates without full reload

### Building for Production

1. Ensure all environment variables are set
2. Run `npm run build`
3. Output in `dist/` directory
4. Static files ready for S3 deployment

## Deployment

### S3 Deployment

```bash
# Build the application
npm run build

# Sync to S3 with appropriate cache headers
aws s3 sync dist/. s3://<UI_BUCKET_NAME>/ --cache-control max-age=604800 --exclude "*.html"
aws s3 sync dist/. s3://<UI_BUCKET_NAME>/ --cache-control max-age=60 --include "*.html"

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id <DISTRIBUTION_ID> --paths "/*"
```

### Cache Strategy

- HTML files: Short cache (60 seconds) for quick updates
- Static assets (JS, CSS, images): Long cache (7 days) - Vite uses content hashing
- CloudFront serves the S3 bucket with global edge caching

## Code Quality

### TypeScript

- Use strict type checking
- Define types for props, emits, and API responses
- Avoid `any` type
- Type definitions in `src/types/` or inline

### Linting

- ESLint with Vue and TypeScript plugins
- Run `npm run lint` before committing
- Auto-fix with `npm run lint:fix`

### Formatting

- Prettier for consistent code style
- Run `npm run pretty` to format
- Configuration in `.prettierrc`

## Common Tasks

### Adding a New Page

1. Create component in `src/views/`
2. Add route in `src/router/`
3. Add navigation link if needed
4. Test authentication guards

### Adding a New Component

1. Create in `src/components/`
2. Use TypeScript and Composition API
3. Use base primitives from `src/components/ui/` and Tailwind CSS utilities
4. Export and use in parent components

### Integrating New API Endpoint

1. Add API function in `src/api/`
2. Authentication is handled automatically via httpOnly cookies
3. Handle errors and loading states
4. Update types if needed

### Working with Forms

- Use UI primitives from `src/components/ui/` (Input, Textarea, Checkbox, etc.)
- Implement validation rules
- Handle submit and reset
- Show error messages clearly

## Performance Best Practices

- Lazy-load routes with dynamic imports
- Use `v-show` vs `v-if` appropriately
- Implement virtual scrolling for large lists
- Optimize images and assets
- Code-split large components

## Important Notes

- Node.js 24 required (see `engines` in package.json)
- Always use TypeScript for new files
- Follow Vue 3 Composition API patterns
- Use UI primitives from `src/components/ui/` for consistency
- Test authentication flows thoroughly
- Keep components small and focused
- Use Pinia stores for shared state
