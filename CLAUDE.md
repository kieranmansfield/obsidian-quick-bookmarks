# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Quick Bookmarks is an Obsidian plugin that provides fuzzy search access to bookmarks from Obsidian's core Bookmarks plugin. The plugin integrates with Obsidian's internal plugins API to retrieve and display bookmarks through modal search interfaces.

## Build & Development Commands

```bash
# Install dependencies
npm install

# Development mode (watch for changes and rebuild automatically)
npm run dev

# Production build (with type checking)
npm run build

# Type check only
tsc -noEmit -skipLibCheck

# Lint
eslint main.ts

# Update dependencies interactively
npm run update
```

## Architecture

### Single-File Structure
Currently, all code lives in `main.ts` (~585 lines). This is acceptable for the current scope but should be refactored if features grow significantly.

### Core Components

**QuickBookmarksPlugin** (main.ts:31-231)
- Main plugin class extending Obsidian's `Plugin`
- Manages settings, registers commands, and dynamically registers group commands
- Accesses Obsidian's internal Bookmarks plugin via `(this.app as any).internalPlugins.plugins.bookmarks`

**BookmarksSearchModal** (main.ts:233-351)
- Fuzzy search modal for all bookmarks
- Supports two modes based on `groupHandling` setting:
  - `"separate"`: Groups appear as navigable items that open new modals
  - `"flatten"`: Groups are expanded inline with path prefixes (e.g., "Group > Item")
- Handles file, folder, search, and group bookmark types

**BookmarkGroupModal** (main.ts:353-455)
- Specialized modal for browsing a specific bookmark group
- Always shows nested items with path prefixes
- Supports nested groups by opening additional modals

**QuickBookmarksSettingTab** (main.ts:457-584)
- Settings UI with three sections:
  1. Group handling mode selector
  2. Per-group command toggles (dynamically generated from bookmark groups)
  3. Individual bookmark ignore toggles (dynamically generated from all bookmarks)

### Key Mechanisms

**Dynamic Command Registration** (main.ts:82-114)
- Group commands are registered/unregistered dynamically when settings change
- Uses `sanitizeId()` to create valid command IDs from group titles
- Commands are stored in `groupCommands` Map for cleanup

**Bookmark ID System** (main.ts:175-185)
- Creates stable IDs for bookmarks: `file:path`, `folder:path`, or `search:query`
- Used for the ignored bookmarks feature to track specific bookmarks across sessions

**Obsidian Internal Plugin Access**
The plugin heavily relies on Obsidian's internal APIs:
- `app.internalPlugins.plugins.bookmarks` - Access bookmark data
- `app.internalPlugins.plugins["file-explorer"].instance.revealInFolder()` - Reveal folders
- `app.internalPlugins.plugins["global-search"].instance.openGlobalSearch()` - Execute searches

These are not official APIs and may change without warning.

## Settings Schema

```typescript
interface QuickBookmarksSettings {
  groupHandling: "flatten" | "separate";
  enabledGroupCommands: Record<string, boolean>; // Maps group title to enabled state
  ignoredBookmarks: string[];                    // Array of bookmark IDs to hide
}
```

## Default Hotkey

The main search modal command is registered with `Cmd+M` (Mac) / `Ctrl+M` (Windows/Linux) by default.

## Important Constraints

1. **No external dependencies**: Plugin bundles all code, only externals are Obsidian APIs
2. **Mobile compatible**: `isDesktopOnly: false` - avoid desktop-only APIs
3. **Type safety**: TypeScript with strict null checks enabled
4. **Build target**: ES2018, CommonJS format
5. **Bookmarks plugin dependency**: Requires core Bookmarks plugin to be enabled

## Testing Workflow

1. Run `npm run dev` to start watch mode
2. Plugin files are in the vault's `.obsidian/plugins/obsidian-quick-bookmarks/` directory
3. Reload Obsidian after changes (Cmd/Ctrl+R or restart)
4. Enable plugin in Settings → Community plugins

## Code Style Notes

- Uses TypeScript with strict null checks
- Indentation: tabs (per .editorconfig)
- ESLint configured with TypeScript rules
- Arrow functions for callbacks
- Async/await for asynchronous operations
- Type assertions used for internal plugin APIs: `(this.app as any)`

## Future Refactoring Considerations

If the codebase grows beyond ~600 lines, consider splitting into:
- `settings.ts` - Settings interface and tab
- `modals.ts` - BookmarksSearchModal and BookmarkGroupModal
- `utils.ts` - Helper functions (getDisplayName, sanitizeId, etc.)
- Keep `main.ts` focused on plugin lifecycle and command registration
