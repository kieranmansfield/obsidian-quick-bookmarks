import {
	App,
	FuzzySuggestModal,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TFolder,
} from "obsidian";

interface BookmarkItem {
	type: string;
	title: string;
	path?: string;
	query?: string;
	items?: any[];
}

interface QuickBookmarksSettings {
	groupHandling: "flatten" | "separate";
	enabledGroupCommands: Record<string, boolean>;
	ignoredBookmarks: string[];
}

const DEFAULT_SETTINGS: QuickBookmarksSettings = {
	groupHandling: "separate",
	enabledGroupCommands: {},
	ignoredBookmarks: [],
};

export default class QuickBookmarksPlugin extends Plugin {
	settings: QuickBookmarksSettings;
	groupCommands: Map<string, any> = new Map();

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "open-bookmarks-search",
			name: "Open bookmarks search",
			hotkeys: [
				{
					modifiers: ["Mod"],
					key: "m",
				},
			],
			callback: () => {
				new BookmarksSearchModal(this.app, this).open();
			},
		});

		this.registerGroupCommands();
		this.addSettingTab(new QuickBookmarksSettingTab(this.app, this));
	}

	getBookmarkGroups(): Array<{ title: string; items: any[] }> {
		const groups: Array<{ title: string; items: any[] }> = [];
		const bookmarkPlugin = (this.app as any).internalPlugins?.plugins
			?.bookmarks;

		if (!bookmarkPlugin || !bookmarkPlugin.enabled) {
			return groups;
		}

		const bookmarkItems = bookmarkPlugin.instance?.items;
		if (!bookmarkItems) {
			return groups;
		}

		bookmarkItems.forEach((item: any) => {
			if (item.type === "group") {
				groups.push({
					title: item.title,
					items: item.items || [],
				});
			}
		});

		return groups;
	}

	registerGroupCommands() {
		// Remove existing group commands
		this.groupCommands.forEach((command, id) => {
			(this.app as any).commands.removeCommand(
				`${this.manifest.id}:${id}`
			);
		});
		this.groupCommands.clear();

		const groups = this.getBookmarkGroups();

		groups.forEach((group) => {
			const commandId = `open-group-${this.sanitizeId(group.title)}`;
			const isEnabled =
				this.settings.enabledGroupCommands[group.title] ?? false;

			if (isEnabled) {
				const command = this.addCommand({
					id: commandId,
					name: `Open group: ${group.title}`,
					callback: () => {
						new BookmarkGroupModal(
							this.app,
							this,
							group.title,
							group.items
						).open();
					},
				});
				this.groupCommands.set(commandId, command);
			}
		});
	}

	sanitizeId(title: string): string {
		return title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
	}

	getAllBookmarks(): Array<{
		id: string;
		title: string;
		type: string;
		path?: string;
	}> {
		const allBookmarks: Array<{
			id: string;
			title: string;
			type: string;
			path?: string;
		}> = [];
		const bookmarkPlugin = (this.app as any).internalPlugins?.plugins
			?.bookmarks;

		if (!bookmarkPlugin || !bookmarkPlugin.enabled) {
			return allBookmarks;
		}

		const bookmarkItems = bookmarkPlugin.instance?.items;
		if (!bookmarkItems) {
			return allBookmarks;
		}

		const processItem = (item: any, parentPath = "") => {
			if (item.type === "group") {
				const groupTitle = parentPath
					? `${parentPath} > ${item.title}`
					: item.title;
				if (item.items) {
					item.items.forEach((child: any) =>
						processItem(child, groupTitle)
					);
				}
			} else {
				const displayName = this.getDisplayName(item);
				const title = parentPath
					? `${parentPath} > ${displayName}`
					: displayName;
				allBookmarks.push({
					id: this.getBookmarkId(item),
					title,
					type: item.type,
					path: item.path,
				});
			}
		};

		bookmarkItems.forEach((item: any) => processItem(item));
		return allBookmarks;
	}

	getBookmarkId(item: any): string {
		// Create a unique ID for each bookmark based on type and path/query
		if (item.type === "file" && item.path) {
			return `file:${item.path}`;
		} else if (item.type === "folder" && item.path) {
			return `folder:${item.path}`;
		} else if (item.type === "search" && item.query) {
			return `search:${item.query}`;
		}
		return "";
	}

	isBookmarkIgnored(item: any): boolean {
		const id = this.getBookmarkId(item);
		return this.settings.ignoredBookmarks.includes(id);
	}

	getDisplayName(item: any): string {
		// Use custom title if available
		if (item.title) {
			return item.title;
		}

		// For files and folders, extract filename without extension from path
		if (item.type === "file" || item.type === "folder") {
			if (item.path) {
				const pathParts = item.path.split("/");
				const filename = pathParts[pathParts.length - 1];
				// Remove file extension for files
				if (item.type === "file") {
					return filename.replace(/\.[^/.]+$/, "");
				}
				return filename;
			}
		}

		// For search, use query as fallback
		if (item.type === "search" && item.query) {
			return item.query;
		}

		return item.path || item.query || "";
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.registerGroupCommands();
	}
}

class BookmarksSearchModal extends FuzzySuggestModal<BookmarkItem> {
	plugin: QuickBookmarksPlugin;
	parentPath: string;

	constructor(app: App, plugin: QuickBookmarksPlugin, parentPath = "") {
		super(app);
		this.plugin = plugin;
		this.parentPath = parentPath;
	}

	getItems(): BookmarkItem[] {
		const bookmarks: BookmarkItem[] = [];
		const bookmarkPlugin = (this.app as any).internalPlugins?.plugins
			?.bookmarks;

		if (!bookmarkPlugin || !bookmarkPlugin.enabled) {
			return bookmarks;
		}

		const bookmarkItems = bookmarkPlugin.instance?.items;
		if (!bookmarkItems) {
			return bookmarks;
		}

		const useSeparateModals =
			this.plugin.settings.groupHandling === "separate";

		const processBookmarkItem = (item: any, parentPath = "") => {
			if (item.type === "group") {
				if (useSeparateModals) {
					// In separate mode, add groups as navigable items
					bookmarks.push({
						type: "group",
						title: item.title,
						items: item.items,
					});
				} else {
					// In flatten mode, process children with group path
					const groupTitle = parentPath
						? `${parentPath} > ${item.title}`
						: item.title;
					if (item.items) {
						item.items.forEach((child: any) =>
							processBookmarkItem(child, groupTitle)
						);
					}
				}
			} else if (item.type === "file") {
				if (!this.plugin.isBookmarkIgnored(item)) {
					const displayName = this.plugin.getDisplayName(item);
					bookmarks.push({
						type: "file",
						title: parentPath
							? `${parentPath} > ${displayName}`
							: displayName,
						path: item.path,
					});
				}
			} else if (item.type === "folder") {
				if (!this.plugin.isBookmarkIgnored(item)) {
					const displayName = this.plugin.getDisplayName(item);
					bookmarks.push({
						type: "folder",
						title: parentPath
							? `${parentPath} > ${displayName}`
							: displayName,
						path: item.path,
					});
				}
			} else if (item.type === "search") {
				if (!this.plugin.isBookmarkIgnored(item)) {
					const displayName = this.plugin.getDisplayName(item);
					bookmarks.push({
						type: "search",
						title: parentPath
							? `${parentPath} > ${displayName}`
							: displayName,
						query: item.query,
					});
				}
			}
		};

		bookmarkItems.forEach((item: any) => processBookmarkItem(item));
		return bookmarks;
	}

	getItemText(item: BookmarkItem): string {
		return item.title;
	}

	onChooseItem(item: BookmarkItem): void {
		if (item.type === "group") {
			// Open a new modal for this group
			new BookmarkGroupModal(
				this.app,
				this.plugin,
				item.title,
				item.items || []
			).open();
		} else if (item.type === "file" && item.path) {
			const file = this.app.vault.getAbstractFileByPath(item.path);
			if (file instanceof TFile) {
				this.app.workspace.getLeaf().openFile(file);
			}
		} else if (item.type === "folder" && item.path) {
			const folder = this.app.vault.getAbstractFileByPath(item.path);
			if (folder instanceof TFolder) {
				(this.app as any).internalPlugins.plugins[
					"file-explorer"
				].instance.revealInFolder(folder);
			}
		} else if (item.type === "search" && item.query) {
			(this.app as any).internalPlugins.plugins[
				"global-search"
			].instance.openGlobalSearch(item.query);
		}
	}
}

class BookmarkGroupModal extends FuzzySuggestModal<BookmarkItem> {
	plugin: QuickBookmarksPlugin;
	groupTitle: string;
	groupItems: any[];

	constructor(
		app: App,
		plugin: QuickBookmarksPlugin,
		groupTitle: string,
		groupItems: any[]
	) {
		super(app);
		this.plugin = plugin;
		this.groupTitle = groupTitle;
		this.groupItems = groupItems;
		this.setPlaceholder(`Search in ${groupTitle}...`);
	}

	getItems(): BookmarkItem[] {
		const bookmarks: BookmarkItem[] = [];

		const processBookmarkItem = (item: any, parentPath = "") => {
			if (item.type === "group") {
				// Nested groups - add as navigable items
				bookmarks.push({
					type: "group",
					title: parentPath
						? `${parentPath} > ${item.title}`
						: item.title,
					items: item.items,
				});
			} else if (item.type === "file") {
				if (!this.plugin.isBookmarkIgnored(item)) {
					const displayName = this.plugin.getDisplayName(item);
					bookmarks.push({
						type: "file",
						title: parentPath
							? `${parentPath} > ${displayName}`
							: displayName,
						path: item.path,
					});
				}
			} else if (item.type === "folder") {
				if (!this.plugin.isBookmarkIgnored(item)) {
					const displayName = this.plugin.getDisplayName(item);
					bookmarks.push({
						type: "folder",
						title: parentPath
							? `${parentPath} > ${displayName}`
							: displayName,
						path: item.path,
					});
				}
			} else if (item.type === "search") {
				if (!this.plugin.isBookmarkIgnored(item)) {
					const displayName = this.plugin.getDisplayName(item);
					bookmarks.push({
						type: "search",
						title: parentPath
							? `${parentPath} > ${displayName}`
							: displayName,
						query: item.query,
					});
				}
			}
		};

		this.groupItems.forEach((item: any) => processBookmarkItem(item));
		return bookmarks;
	}

	getItemText(item: BookmarkItem): string {
		return item.title;
	}

	onChooseItem(item: BookmarkItem): void {
		if (item.type === "group") {
			// Open another modal for nested group
			new BookmarkGroupModal(
				this.app,
				this.plugin,
				item.title,
				item.items || []
			).open();
		} else if (item.type === "file" && item.path) {
			const file = this.app.vault.getAbstractFileByPath(item.path);
			if (file instanceof TFile) {
				this.app.workspace.getLeaf().openFile(file);
			}
		} else if (item.type === "folder" && item.path) {
			const folder = this.app.vault.getAbstractFileByPath(item.path);
			if (folder instanceof TFolder) {
				(this.app as any).internalPlugins.plugins[
					"file-explorer"
				].instance.revealInFolder(folder);
			}
		} else if (item.type === "search" && item.query) {
			(this.app as any).internalPlugins.plugins[
				"global-search"
			].instance.openGlobalSearch(item.query);
		}
	}
}

class QuickBookmarksSettingTab extends PluginSettingTab {
	plugin: QuickBookmarksPlugin;

	constructor(app: App, plugin: QuickBookmarksPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Quick Bookmarks Settings" });

		new Setting(containerEl)
			.setName("Group handling")
			.setDesc(
				"Choose how to display bookmark groups. 'Separate modals' opens a new search for each group. 'Flatten all' shows all bookmarks with their group path."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("separate", "Separate modals")
					.addOption("flatten", "Flatten all")
					.setValue(this.plugin.settings.groupHandling)
					.onChange(async (value) => {
						this.plugin.settings.groupHandling = value as
							| "flatten"
							| "separate";
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Group Commands" });
		containerEl.createEl("p", {
			text: "Enable separate commands for specific bookmark groups. These commands will appear in the command palette.",
			cls: "setting-item-description",
		});

		const groups = this.plugin.getBookmarkGroups();

		if (groups.length === 0) {
			containerEl.createEl("p", {
				text: "No bookmark groups found. Create groups in the Bookmarks core plugin to enable group commands.",
				cls: "setting-item-description",
			});
		} else {
			groups.forEach((group) => {
				new Setting(containerEl)
					.setName(group.title)
					.setDesc(`Enable command to open "${group.title}" group`)
					.addToggle((toggle) =>
						toggle
							.setValue(
								this.plugin.settings.enabledGroupCommands[
									group.title
								] ?? false
							)
							.onChange(async (value) => {
								this.plugin.settings.enabledGroupCommands[
									group.title
								] = value;
								await this.plugin.saveSettings();
							})
					);
			});
		}

		containerEl.createEl("h3", { text: "Ignored Bookmarks" });
		containerEl.createEl("p", {
			text: "Select bookmarks to hide from the search modal. Ignored bookmarks will not appear in search results.",
			cls: "setting-item-description",
		});

		const allBookmarks = this.plugin.getAllBookmarks();

		if (allBookmarks.length === 0) {
			containerEl.createEl("p", {
				text: "No bookmarks found. Add bookmarks in the Bookmarks core plugin to manage them here.",
				cls: "setting-item-description",
			});
		} else {
			allBookmarks.forEach((bookmark) => {
				const typeIcon =
					bookmark.type === "file"
						? "📄"
						: bookmark.type === "folder"
						? "📁"
						: "🔍";
				new Setting(containerEl)
					.setName(`${typeIcon} ${bookmark.title}`)
					.addToggle((toggle) =>
						toggle
							.setValue(
								this.plugin.settings.ignoredBookmarks.includes(
									bookmark.id
								)
							)
							.setTooltip(
								this.plugin.settings.ignoredBookmarks.includes(
									bookmark.id
								)
									? "Click to show in search"
									: "Click to hide from search"
							)
							.onChange(async (value) => {
								if (value) {
									if (
										!this.plugin.settings.ignoredBookmarks.includes(
											bookmark.id
										)
									) {
										this.plugin.settings.ignoredBookmarks.push(
											bookmark.id
										);
									}
								} else {
									this.plugin.settings.ignoredBookmarks =
										this.plugin.settings.ignoredBookmarks.filter(
											(id) => id !== bookmark.id
										);
								}
								await this.plugin.saveSettings();
							})
					);
			});
		}
	}
}
