# GitGazer Guided Tour — UX Architecture Specification

> **Author**: ArchitectUX  
> **Date**: 2026-03-29  
> **Status**: Ready for UI Designer handoff  
> **Scope**: New user onboarding tour for the GitGazer web application

---

## 1. Problem Statement

New users who log in to GitGazer for the first time land on the Overview page with no guidance on what the product does, how to set up integrations, or how to navigate the six main sections. The current onboarding consists only of the login page feature bullets and per-page empty states — there is no connected walkthrough that teaches the product's value proposition and setup flow.

**Goal**: Guide new users from first login to "aha moment" (seeing their first workflow data) in under 2 minutes.

---

## 2. Tour Trigger & Lifecycle

### When the Tour Starts

| Trigger           | Behavior                                                           |
| ----------------- | ------------------------------------------------------------------ |
| First login ever  | Tour starts automatically after redirect from login to `/overview` |
| Subsequent visits | Tour does NOT auto-start; available via "?" help button in header  |
| Manual restart    | User clicks help button → "Restart tour" option in dropdown        |

### Persistence

- Store `tourCompleted: boolean` and `tourDismissedAt: string | null` in **localStorage** under key `gitgazer:tour`.
- If the user dismisses early, record the step they stopped at (`tourLastStep: number`) so "Resume tour" can pick up where they left off.
- No backend API needed — this is purely client-side state.

### Exit Conditions

| Action                   | Result                                                 |
| ------------------------ | ------------------------------------------------------ |
| Completes all steps      | `tourCompleted = true`, confetti/success moment        |
| Clicks "Skip tour"       | Tour closes, `tourDismissedAt` set, "Resume" available |
| Presses Escape           | Same as "Skip tour"                                    |
| Clicks outside spotlight | Step stays open (prevent accidental dismiss)           |
| Browser refresh mid-tour | Tour resumes at last completed step                    |

---

## 3. Tour Overlay System — Interaction Pattern

### Spotlight + Popover Model

The tour uses a **spotlight highlight** pattern (not a modal wizard):

```
┌─────────────────────────────────────────────────────┐
│  Semi-transparent overlay (bg-black/60)             │
│                                                      │
│    ┌──────────────────────┐                          │
│    │  Highlighted element │ ← Spotlight cutout       │
│    │  (full opacity, ring)│   with 8px border-radius │
│    └──────────────────────┘   and 4px padding        │
│              │                                        │
│              ▼                                        │
│    ┌────────────────────────┐                        │
│    │ Step 2 of 7            │ ← Popover card         │
│    │                        │                        │
│    │ Title goes here        │                        │
│    │ Description text that  │                        │
│    │ explains what this     │                        │
│    │ element does.          │                        │
│    │                        │                        │
│    │ [Back]     [Next →]    │                        │
│    │         Skip tour      │                        │
│    └────────────────────────┘                        │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Popover Card Anatomy

```
┌──────────────────────────────────────┐
│ ○ ○ ○ ○ ● ○ ○        Step 5 of 7   │  ← Progress dots + counter
│                                      │
│ [Icon] Set Up Notifications          │  ← Icon + Title (text-lg font-semibold)
│                                      │
│ Create rules to get alerted when     │  ← Description (text-sm text-muted-foreground)
│ workflows fail. Route alerts to      │
│ Slack, email, or webhooks.           │
│                                      │
│ ┌──────────────────────────────────┐ │
│ │ 💡 Pro tip: Start with a rule   │ │  ← Optional tip callout (bg-primary/5 rounded-lg)
│ │    for your most critical repo.  │ │
│ └──────────────────────────────────┘ │
│                                      │
│ [← Back]              [Next →]       │  ← Navigation buttons
│            Skip tour                 │  ← Skip link (text-xs text-muted-foreground)
└──────────────────────────────────────┘
```

### Popover Positioning Rules

| Priority | Rule                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- |
| 1        | Place popover on the side with most available space                                       |
| 2        | Prefer `bottom` for horizontal elements (nav tabs, header items)                          |
| 3        | Prefer `right` for vertical elements (sidebar-style, cards)                               |
| 4        | Never obscure the spotlighted element                                                     |
| 5        | Auto-scroll the page to bring the target element into viewport before showing the popover |
| 6        | On mobile (< 768px), always position popover below the spotlight, full-width with margins |

### Spotlight Behavior

- Cutout matches the bounding box of the target element + `4px` padding on each side
- Border-radius: `8px` (matches GitGazer card radius)
- Spotlight ring: `2px solid var(--primary)` with `ring-primary/30` glow
- Animate cutout position/size with `transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1)`
- Dark overlay: `bg-black/60 backdrop-blur-[2px]`

---

## 4. Tour Steps — Content & Targets

### Step Flow

The tour follows the **logical setup journey** a new user would take, not just a left-to-right nav tour:

```
Welcome → Navigation → Overview Stats → Integrations Setup →
Workflows Table → Notifications → Dashboards → Completion
```

---

### Step 1: Welcome (No spotlight — centered dialog)

| Property        | Value                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| **Type**        | Centered modal (no spotlight target)                                                                   |
| **Icon**        | `Sparkles` from lucide                                                                                 |
| **Title**       | Welcome to GitGazer!                                                                                   |
| **Description** | Your command center for GitHub workflow monitoring. Let's take a quick tour to get you up and running. |
| **Primary CTA** | Start Tour →                                                                                           |
| **Secondary**   | Skip tour                                                                                              |
| **Animation**   | Fade-in with subtle scale (0.95 → 1.0)                                                                 |

**Layout**: Centered card on dark overlay, max-width 420px. The GitGazer logo (GitBranch icon in primary square) sits above the title.

---

### Step 2: Navigation Bar

| Property         | Value                                                                                                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Target**       | `nav` element (the 6-tab bar in `AppNav.vue`)                                                                    |
| **Popover side** | `bottom`                                                                                                         |
| **Icon**         | `Compass`                                                                                                        |
| **Title**        | Your Navigation Hub                                                                                              |
| **Description**  | Six sections give you complete visibility into your CI/CD pipelines. We'll walk through the most important ones. |
| **Tip**          | The active tab is highlighted — you're currently on Overview.                                                    |
| **CSS selector** | `.grid.grid-cols-6` inside the nav container                                                                     |

---

### Step 3: Overview — Stat Cards

| Property         | Value                                                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Target**       | The stat cards grid (all 4 cards as a group)                                                                              |
| **Popover side** | `bottom`                                                                                                                  |
| **Icon**         | `Activity`                                                                                                                |
| **Title**        | Pipeline Health at a Glance                                                                                               |
| **Description**  | See total workflows, success rate, failures, and in-progress runs. These update in real-time as your CI/CD pipelines run. |
| **Tip**          | Use the date picker in the top-right to change the time window.                                                           |
| **CSS selector** | The stat cards wrapper element in `OverviewPage.vue`                                                                      |

---

### Step 4: Integrations (navigate to page)

| Property         | Value                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Pre-action**   | `router.push('/integrations')` — wait for route transition to complete                                                |
| **Target**       | The page header area / "Add Integration" button (or empty state if no integrations exist)                             |
| **Popover side** | `bottom`                                                                                                              |
| **Icon**         | `Webhook`                                                                                                             |
| **Title**        | Connect Your Repositories                                                                                             |
| **Description**  | Set up a GitHub webhook or install the GitHub App to start receiving workflow data. This is the essential first step. |
| **Tip**          | The GitHub App is recommended — it's easier to set up and supports more features.                                     |
| **Primary CTA**  | Next → (continues tour)                                                                                               |
| **Note**         | Do NOT force the user to create an integration during the tour — just show them where it is                           |

---

### Step 5: Workflows (navigate to page)

| Property         | Value                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pre-action**   | `router.push('/workflows')`                                                                                                                       |
| **Target**       | The workflow table (or empty state placeholder)                                                                                                   |
| **Popover side** | `top` (table is large, popover above it)                                                                                                          |
| **Icon**         | `PlayCircle`                                                                                                                                      |
| **Title**        | Your Workflow History                                                                                                                             |
| **Description**  | Every GitHub Actions run appears here in real-time. Filter by repository, branch, status, or actor. Expand any row to see individual job details. |
| **Tip**          | Save custom filter combinations as Views for quick access.                                                                                        |

---

### Step 6: Notifications (navigate to page)

| Property         | Value                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Pre-action**   | `router.push('/notifications')`                                                                                     |
| **Target**       | Page content area (empty state or notification cards)                                                               |
| **Popover side** | `bottom`                                                                                                            |
| **Icon**         | `BellRing`                                                                                                          |
| **Title**        | Never Miss a Failure                                                                                                |
| **Description**  | Create notification rules to get alerted when workflows fail. Target specific repositories, workflows, or branches. |
| **Tip**          | Start with a rule for your most critical production deployment workflow.                                            |

---

### Step 7: Dashboards (navigate to page)

| Property         | Value                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Pre-action**   | `router.push('/dashboards')`                                                                                                            |
| **Target**       | Dashboard list cards (DORA Metrics, SPACE Framework)                                                                                    |
| **Popover side** | `bottom`                                                                                                                                |
| **Icon**         | `LayoutDashboard`                                                                                                                       |
| **Title**        | Engineering Metrics                                                                                                                     |
| **Description**  | Track DORA and SPACE metrics to measure your team's software delivery performance. Deployment frequency, change failure rate, and more. |
| **Tip**          | These dashboards work best with at least 2 weeks of workflow data.                                                                      |

---

### Step 8: Completion (No spotlight — centered dialog)

| Property          | Value                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| **Type**          | Centered modal (no spotlight target), return user to `/integrations`                                     |
| **Icon**          | `PartyPopper`                                                                                            |
| **Title**         | You're All Set!                                                                                          |
| **Description**   | You've seen the key features of GitGazer. The recommended next step is to set up your first integration. |
| **Primary CTA**   | Set Up Integration → (navigates to `/integrations`)                                                      |
| **Secondary CTA** | Go to Overview (navigates to `/overview`)                                                                |
| **Tertiary**      | Dismiss                                                                                                  |
| **Animation**     | Confetti burst animation (lightweight CSS-only, 2-second duration)                                       |

---

## 5. Component Architecture

### File Structure

```
src/
├── components/
│   └── tour/
│       ├── GuidedTour.vue           # Tour orchestrator (overlay + step management)
│       ├── TourSpotlight.vue        # SVG overlay with cutout mask
│       ├── TourPopover.vue          # Popover card component
│       ├── TourWelcome.vue          # Welcome step (centered modal variant)
│       ├── TourCompletion.vue       # Completion step with CTA
│       └── tourSteps.ts             # Step definitions (data, not components)
├── composables/
│   └── useTour.ts                   # Tour state machine & logic
└── stores/
    └── tour.ts                      # Pinia store for tour persistence (optional, could be composable-only)
```

### Component Responsibilities

#### `useTour.ts` (composable)

```typescript
// Core state
interface TourState {
    isActive: boolean;
    currentStep: number;
    totalSteps: number;
    tourCompleted: boolean;
    tourDismissedAt: string | null;
}

// Public API
function startTour(): void;
function nextStep(): void;
function prevStep(): void;
function skipTour(): void;
function resumeTour(): void;
function resetTour(): void;

// Computed
const currentStepConfig: ComputedRef<TourStep>;
const isFirstStep: ComputedRef<boolean>;
const isLastStep: ComputedRef<boolean>;
const progress: ComputedRef<number>; // 0-1 float
const canResume: ComputedRef<boolean>;
```

#### `tourSteps.ts` (step data)

```typescript
interface TourStep {
    id: string;
    type: 'spotlight' | 'modal';
    title: string;
    description: string;
    icon: Component; // Lucide icon component
    tip?: string;
    target?: string; // CSS selector for spotlight
    popoverSide?: 'top' | 'right' | 'bottom' | 'left';
    preAction?: () => Promise<void>; // e.g., router.push
    postAction?: () => void;
}
```

#### `GuidedTour.vue` (orchestrator)

- Mounted at the **app shell level** (`Default.vue`), always present when authenticated
- Renders the overlay, spotlight, and popover based on `useTour` state
- Handles keyboard navigation (Arrow keys for prev/next, Escape to skip)
- Manages scroll-into-view for target elements
- Watches route changes triggered by pre-actions

#### `TourSpotlight.vue`

- Full-screen SVG overlay with a `<mask>` element that creates the cutout
- Uses `getBoundingClientRect()` on the target element to position the cutout
- Recalculates on window resize and scroll
- Animates cutout position/size transitions

#### `TourPopover.vue`

- Positioned relative to the spotlight cutout using Floating UI (or manual calculation)
- Contains: progress indicator, icon, title, description, tip callout, navigation buttons
- Auto-flips to opposite side if insufficient space

---

## 6. Interaction Details

### Keyboard Navigation

| Key           | Action                                           |
| ------------- | ------------------------------------------------ |
| `→` / `Enter` | Next step                                        |
| `←`           | Previous step                                    |
| `Escape`      | Skip/dismiss tour                                |
| `Tab`         | Cycles focus within popover (Back → Next → Skip) |

### Transitions Between Steps

1. Current popover fades out (150ms)
2. If next step has a `preAction` (route change), execute it and wait for `nextTick` + transition
3. Spotlight cutout animates to new target position (300ms ease-out)
4. New popover fades in (150ms) once spotlight settles

### Scroll Behavior

- Before showing a step, `scrollIntoView({ behavior: 'smooth', block: 'center' })` the target
- Wait 300ms after scroll completes before showing the popover
- If target is in the header/nav (sticky elements), no scroll needed

### Mobile Responsiveness

| Breakpoint          | Behavior                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Desktop (≥ 1024px)  | Standard spotlight + floating popover                                                                              |
| Tablet (768–1023px) | Popover width constrained to 360px max                                                                             |
| Mobile (< 768px)    | Spotlight still visible; popover renders as bottom sheet (fixed bottom, full-width, max-height 60vh, rounded-t-xl) |

---

## 7. Visual Design Tokens

These map to the existing GitGazer Tailwind CSS design system:

| Token                  | Value                                                 | Usage                                |
| ---------------------- | ----------------------------------------------------- | ------------------------------------ |
| Overlay                | `bg-black/60 backdrop-blur-[2px]`                     | Dark scrim behind spotlight          |
| Spotlight ring         | `ring-2 ring-primary ring-offset-2`                   | Highlight around target              |
| Spotlight glow         | `shadow-[0_0_0_4px_rgba(var(--primary),0.15)]`        | Soft glow effect                     |
| Popover bg             | `bg-card border rounded-xl shadow-xl`                 | Matches existing card style          |
| Popover max-width      | `max-w-sm` (384px)                                    | Fits content without being intrusive |
| Progress dots active   | `bg-primary`                                          | Current step dot                     |
| Progress dots inactive | `bg-muted-foreground/30`                              | Other step dots                      |
| Tip callout bg         | `bg-primary/5 border border-primary/10 rounded-lg`    | Subtle brand-tinted background       |
| Title                  | `text-lg font-semibold text-foreground`               | Step heading                         |
| Description            | `text-sm text-muted-foreground leading-relaxed`       | Body text                            |
| Navigation buttons     | Use existing `Button` component, `size="sm"`          | Primary: `default`, Back: `ghost`    |
| Skip link              | `text-xs text-muted-foreground hover:text-foreground` | Minimal visual weight                |

---

## 8. Help Button (Persistent Access)

### Placement

Add a help button to `AppHeader.vue`, positioned between the `ThemeToggle` and the user avatar:

```
[GitGazer Logo] [Tagline]              [ThemeToggle] [?] [Avatar] [Logout]
```

### Behavior

| State                       | Button appearance                            | Click action                                         |
| --------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| Tour never started          | Subtle pulse animation (3 cycles then stops) | Starts tour                                          |
| Tour completed              | Static `CircleHelp` icon                     | Opens dropdown: "Restart tour", "Keyboard shortcuts" |
| Tour in progress            | Hidden (tour is already active)              | N/A                                                  |
| Tour dismissed (can resume) | Dot indicator on icon                        | Opens dropdown: "Resume tour", "Restart tour"        |

### Dropdown Menu

Uses existing `DropdownMenu` component:

```
┌──────────────────────┐
│ 🔄 Restart tour      │
│ ▶️  Resume tour       │  ← Only shown if tour was dismissed
│ ⌨️  Keyboard shortcuts│
└──────────────────────┘
```

---

## 9. Accessibility Requirements

| Requirement      | Implementation                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------ |
| Focus management | When a step opens, focus moves to the popover. On close, focus returns to previously focused element.  |
| ARIA attributes  | Popover: `role="dialog"`, `aria-modal="true"`, `aria-label="Tour step N of M: {title}"`                |
| Overlay          | `aria-hidden="true"` on the overlay SVG                                                                |
| Progress         | `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`                            |
| Screen reader    | Each step title + description is read on focus. Tip is announced as secondary.                         |
| Reduced motion   | If `prefers-reduced-motion: reduce`, skip all transitions and animations (no slide, no confetti)       |
| Focus trap       | Tab cycling stays within the popover while tour is active                                              |
| Escape           | Always dismisses the tour (standard dialog pattern)                                                    |
| Color contrast   | All text meets WCAG 2.1 AA (4.5:1 for body, 3:1 for large text) — inherits from existing design system |

---

## 10. Edge Cases

| Scenario                                                      | Handling                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Target element not found (e.g., empty state replaced content) | Fall back to centering the popover without spotlight; log warning                    |
| Window resize during tour                                     | Recalculate spotlight and popover position via ResizeObserver                        |
| Route guard blocks navigation                                 | Skip that step with a brief "Skipping..." indicator, proceed to next                 |
| User manually navigates away                                  | Pause tour, show toast: "Tour paused. Click ? to resume."                            |
| Multiple browser tabs                                         | Tour state is per-tab (sessionStorage for active state, localStorage for completion) |
| Very small screens (< 360px)                                  | Reduce popover padding, truncate tips, hide progress dots                            |

---

## 11. Implementation Priority

### Phase 1 — Core (MVP)

1. `useTour` composable with localStorage persistence
2. `GuidedTour.vue` orchestrator with overlay + spotlight
3. `TourPopover.vue` with step navigation
4. All 8 step definitions in `tourSteps.ts`
5. Auto-start on first login
6. Help button in header with "Restart tour"

### Phase 2 — Polish

1. Smooth spotlight cutout transitions
2. Mobile bottom-sheet variant
3. Keyboard navigation (arrows, escape, tab trap)
4. "Resume tour" from dismissed state
5. Completion confetti animation

### Phase 3 — Enhancements (future)

1. Contextual micro-tours for specific features (e.g., "Saved Views" in workflows)
2. "What's New" tour for major feature launches
3. Analytics: track step completion rates to identify drop-off points

---

## 12. Developer Handoff Summary

### For the UI Designer

The UX structure, step flow, interaction patterns, and component architecture are fully defined above. The UI Designer should:

1. **Design the popover card** — visually using the tokens listed in Section 7, incorporating the existing GitGazer card/button/typography patterns
2. **Design the welcome modal** (Step 1) — branded, warm, with the GitGazer logo
3. **Design the completion modal** (Step 8) — celebratory, with clear CTA hierarchy
4. **Design the progress indicator** — dots vs. bar vs. fraction, fitting the card layout
5. **Design the spotlight glow** — subtle ring that draws attention without being harsh
6. **Design the help button** — icon choice, hover state, dropdown, pulse animation for first-time users
7. **Design mobile bottom-sheet variant** — for the popover on small screens
8. **Implement all components** under `src/components/tour/` using Vue 3 `<script setup>`, Tailwind CSS, Radix Vue where appropriate, and Lucide icons

### Existing Components to Reuse

- `Button.vue` — for Back/Next/CTA buttons
- `Card.vue` — visual reference for popover card styling
- `Dialog.vue` — reference for overlay + centered modal pattern
- `DropdownMenu.vue` — for the help button dropdown
- `Tooltip.vue` — reference for floating UI positioning

### Data Contract

The step definitions in `tourSteps.ts` should be the single source of truth. Each step is a plain object — no component per step. The `GuidedTour.vue` renders the correct layout based on `step.type` ('spotlight' vs 'modal').

---

_Ready for UI Designer implementation._
