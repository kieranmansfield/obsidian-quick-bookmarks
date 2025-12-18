# Quick Bookmarks for Obsidian

Quickly access your Obsidian bookmarks through a fuzzy search interface. This plugin integrates with Obsidian's core Bookmarks plugin to provide fast, keyboard-driven access to all your bookmarked files, folders, searches, and bookmark groups.

## Features

### 🔍 Fuzzy Search Modal

Access all your bookmarks through a searchable modal with fuzzy matching:

-   **Default hotkey**: `Cmd+M` (Mac) / `Ctrl+M` (Windows/Linux)
-   Search across all bookmark types: files, folders, searches, and groups
-   Navigate nested groups with breadcrumb paths

### 📁 Group Handling Modes

Choose how bookmark groups are displayed:

**Separate Modals** (default)

-   Groups appear as items in the main search
-   Selecting a group opens a new focused search modal
-   Ideal for organized bookmark collections

**Flatten All**

-   All bookmarks shown in one list with group paths
-   Example: "Work > Projects > Project A.md"
-   Ideal for quick access across all bookmarks

### ⚡ Per-Group Commands

Create dedicated commands for specific bookmark groups:

-   Enable commands for frequently-used groups
-   Each enabled group gets its own command in the command palette
-   Example: "Open group: Daily Notes" as a standalone command

### 🚫 Hide Bookmarks

Selectively hide bookmarks from search results:

-   Toggle visibility for individual bookmarks
-   Hidden bookmarks won't appear in search modals
-   Useful for archival or organizational bookmarks

## Installation

### From Obsidian Community Plugins (When Available)

1. Open **Settings** → **Community plugins**
2. Disable **Restricted mode** if enabled
3. Click **Browse** and search for "Quick Bookmarks"
4. Click **Install**, then **Enable**

### Manual Installation

1. Download the latest release from the [Releases page](https://github.com/kieranmansfield/obsidian-quick-bookmarks/releases)
2. Extract the files to your vault's plugins folder:
    ```
    <vault>/.obsidian/plugins/obsidian-quick-bookmarks/
    ```
3. The folder should contain:
    - `main.js`
    - `manifest.json`
    - `styles.css` (if present)
4. Reload Obsidian
5. Enable the plugin in **Settings** → **Community plugins**

### Development Installation

If you're developing or testing:

1. Clone this repository into your vault's plugins folder:
    ```bash
    cd <vault>/.obsidian/plugins/
    git clone https://github.com/kieranmansfield/obsidian-quick-bookmarks.git
    cd obsidian-quick-bookmarks
    ```
2. Install dependencies:
    ```bash
    npm install
    ```
3. Build the plugin:
    ```bash
    npm run dev
    ```
4. Reload Obsidian and enable the plugin

## Usage

### Basic Search

1. Press `Cmd+M` (Mac) or `Ctrl+M` (Windows/Linux)
2. Type to search your bookmarks
3. Press `Enter` to open the selected bookmark

### Bookmark Types

The plugin supports all bookmark types from the core Bookmarks plugin:

-   **Files**: Opens the file in the active pane
-   **Folders**: Reveals the folder in the file explorer
-   **Searches**: Executes the search in global search
-   **Groups**: Opens a new search modal for that group (in "Separate" mode)

### Configuration

Access settings in **Settings** → **Quick Bookmarks**:

#### Group Handling

Choose between:

-   **Separate modals**: Navigate groups hierarchically
-   **Flatten all**: Show all bookmarks with full paths

#### Group Commands

Enable standalone commands for specific bookmark groups. Each enabled group will appear in the command palette.

#### Ignored Bookmarks

Toggle visibility for individual bookmarks. Hidden bookmarks are excluded from all search modals.

## Requirements

-   Obsidian v0.15.0 or higher
-   Core **Bookmarks** plugin must be enabled

## Development

### Building

```bash
# Development mode (watch for changes)
npm run dev

# Production build
npm run build

# Type check
npm run build  # Includes tsc -noEmit

# Update dependencies
npm run update
```

### Project Structure

-   `main.ts` - Plugin source code
-   `manifest.json` - Plugin metadata
-   `styles.css` - Plugin styles
-   `esbuild.config.mjs` - Build configuration

### Release Process

1. Update version in `manifest.json` and `package.json`
2. Update `minAppVersion` in `manifest.json` if needed
3. Run `npm version patch/minor/major` to update version files
4. Create a GitHub release with tag matching the version number
5. Attach `manifest.json`, `main.js`, and `styles.css` as release assets

## Support

-   **Issues**: [GitHub Issues](https://github.com/kieranmansfield/obsidian-quick-bookmarks/issues)
-   **Discussions**: [GitHub Discussions](https://github.com/kieranmansfield/obsidian-quick-bookmarks/discussions)

## Contributing

Contributions are welcome! Please feel free to submit pull requests or open issues for bugs and feature requests.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

**Kieran Mansfield**

-   Website: [kieranmansfield.com](https://kieranmansfield.com)
-   GitHub: [@kieranmansfield](https://github.com/kieranmansfield)

## Acknowledgments

Built with the [Obsidian Plugin Template](https://github.com/obsidianmd/obsidian-sample-plugin) and powered by the [Obsidian API](https://github.com/obsidianmd/obsidian-api).
