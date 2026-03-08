---
applyTo: '04_frontend/**/*.{vue,ts,json}'
---

# Frontend Development Instructions

This module contains the Vue 3 + Vuetify SPA frontend for GitGazer.

## Build and Test Commands

```bash
cd 04_frontend

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
- **UI Library**: Vuetify 3
- **State Management**: Pinia
- **Router**: Vue Router 4
- **Build Tool**: Vite
- **Authentication**: httpOnly cookies with AWS Cognito
- **TypeScript**: For type safety

### Project Structure

- `src/components/`: Reusable Vue components
- `src/views/`: Page-level components (routed)
- `src/router/`: Vue Router configuration
- `src/stores/`: Pinia state stores
- `src/plugins/`: Vue plugins (Vuetify, etc.)
- `src/api/`: API client functions
- `public/`: Static assets

## Development Patterns

### Component Development

- Use Composition API with `<script setup>` syntax
- Always use TypeScript for better type safety
- Follow Vuetify component patterns
- Use Material Design Icons (`@mdi/font`)

Example:

```vue
<script setup lang="ts">
    import {ref} from 'vue';
    import type {MyType} from '@/types';

    const data = ref<MyType[]>([]);
</script>

<template>
    <v-container>
        <!-- Vuetify components -->
    </v-container>
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
- Follow Vue Router 4 patterns

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
VITE_HOST_URL="http://localhost:5173"
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

## Vuetify Usage

### Component Auto-Import

- Vuetify components auto-imported
- Configuration in `vite.config.ts`
- Types generated in `components.d.ts`

### Theming

- Configure in `src/plugins/vuetify.ts`
- Use Vuetify's built-in theming system
- Follow Material Design guidelines

### Icons

- Material Design Icons via `@mdi/font`
- Use `mdi-*` prefix for icons
- Example: `<v-icon>mdi-home</v-icon>`

## Development Workflow

### Local Development

1. Set up `.env.local` with environment variables
2. Run `npm ci` to install dependencies
3. Run `npm run dev` to start dev server
4. Open `http://localhost:5173` in browser

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
3. Follow Vuetify patterns
4. Export and use in parent components

### Integrating New API Endpoint

1. Add API function in `src/api/`
2. Use AWS Signature V4 if authenticated
3. Handle errors and loading states
4. Update types if needed

### Working with Forms

- Use Vuetify form components
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
- Use Vuetify components for consistency
- Test authentication flows thoroughly
- Keep components small and focused
- Use Pinia stores for shared state
