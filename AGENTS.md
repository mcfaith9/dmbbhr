# DMBBHR — AI Development Instructions

## 1. Project Identity

DMBBHR is an existing employee attendance, HR management, and payroll web application.

**This project uses Vue 3. It is NOT a React application.**

Before modifying code, inspect the actual repository and follow its existing implementation.

## 2. Technology Stack

- Vue 3
- Vue Composition API
- TypeScript
- Vite
- shadcn-vue UI components
- Tailwind CSS
- Vue Router using the existing routing configuration
- Dexie / IndexedDB for existing local database functionality
- Existing biometric attendance agent and device integration
- Existing services, repositories, and payroll calculation modules

Treat this list as project guidance, not permission to replace or upgrade dependencies. Verify the actual configuration in `package.json` and the source files.

## 3. Mandatory Framework Rules

- Use Vue Single-File Components (`.vue`) and `<script setup lang="ts">` where appropriate.
- Use Vue's native reactivity APIs from `vue`, including `ref`, `computed`, `reactive`, `watch`, and lifecycle hooks.
- Use existing shadcn-vue components and project conventions.
- Do not introduce React, React DOM, React hooks, React-specific reactivity wrappers, or React component patterns.
- Do not create custom replacements for Vue's `ref()` or `computed()` without a documented, necessary reason.
- Do not introduce JSX or TSX unless the existing project explicitly requires it.
- Do not install dependencies without a demonstrated need.

## 4. Preserve the Existing Architecture

Before changing code:

1. Inspect the relevant files and their callers.
2. Check existing services, repositories, shared state, and data models.
3. Review Git status and the diff when available.
4. Identify the smallest set of files that needs modification.
5. Explain important assumptions before implementing changes.

Never regenerate the project from scratch or replace existing modules simply because a different implementation is easier.

## 5. Critical Functionality

Take extra care when editing:

- Biometric device connectivity and attendance synchronization.
- Attendance timestamps, imported records, and duplicate detection.
- Dexie / IndexedDB persistence.
- Live attendance and Punch Display communication.
- Employee records and HR notices.
- Payroll calculations, cutoff periods, benefits, contributions, loans, cash advances, and deductions.

Do not create duplicate device connections, duplicate services, or competing sources of truth.

Do not delete, overwrite, or fabricate real employee, attendance, or payroll data.

## 6. Git and File Safety


## 7. Verification Requirements

After implementing a change:

1. Run the existing build command from `package.json`.
2. Run the relevant existing tests.
3. Check for TypeScript errors and broken imports.
4. Review the final diff.
5. Report any failed checks or unverified behavior honestly.

A successful build does not by itself prove that all existing functionality still works.

## 8. Required AI Workflow

For every task:

**Inspect → Explain the plan → Make targeted changes → Test → Report.**

If essential information is missing, inspect the repository rather than inventing an implementation.

Keep changes focused on the user's request. Do not modify unrelated functionality.

**Highest-priority rule: Preserve the existing Vue 3 project and its working architecture. Never convert it to React or introduce incompatible code.**