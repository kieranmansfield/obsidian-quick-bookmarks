import { App, FuzzySuggestModal, Plugin, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian'

// Type definitions for Obsidian's internal bookmark plugin API
type BookmarkItemType = 'file' | 'folder' | 'search' | 'group'

interface InternalBookmarkItem {
	type: BookmarkItemType
	title?: string
	path?: string
	query?: string
	items?: InternalBookmarkItem[]
}

interface InternalBookmarksPluginInstance {
	items: InternalBookmarkItem[]
}

interface InternalBookmarksPlugin {
	enabled: boolean
	instance?: InternalBookmarksPluginInstance
}

interface InternalFileExplorerInstance {
	revealInFolder(folder: TFolder): void
}

interface InternalGlobalSearchInstance {
	openGlobalSearch(query: string): void
}

interface InternalPlugins {
	plugins: {
		bookmarks?: InternalBookmarksPlugin
		'file-explorer'?: {
			instance: InternalFileExplorerInstance
		}
		'global-search'?: {
			instance: InternalGlobalSearchInstance
		}
	}
}

interface ObsidianAppWithInternals extends App {
	internalPlugins?: InternalPlugins
	commands?: {
		removeCommand(id: string): void
	}
}

interface BookmarkItem {
	type: BookmarkItemType
	title: string
	path?: string
	query?: string
	items?: InternalBookmarkItem[]
}

interface QuickBookmarksSettings {
	groupHandling: 'flatten' | 'separate'
	enabledGroupCommands: Record<string, boolean>
	ignoredBookmarks: string[]
}

const DEFAULT_SETTINGS: QuickBookmarksSettings = {
	groupHandling: 'separate',
	enabledGroupCommands: {},
	ignoredBookmarks: [],
}

export default class QuickBookmarksPlugin extends Plugin {
	settings!: QuickBookmarksSettings
	groupCommands: Set<string> = new Set()

	declare app: ObsidianAppWithInternals

	async onload() {
		await this.loadSettings()

		this.addCommand({
			id: 'open-bookmarks-search',
			name: 'Open bookmarks search',
			callback: () => {
				new BookmarksSearchModal(this.app, this).open()
			},
		})

		this.registerGroupCommands()
		this.addSettingTab(new QuickBookmarksSettingTab(this.app, this))
	}

	getBookmarkGroups(): Array<{ title: string; items: InternalBookmarkItem[] }> {
		const groups: Array<{ title: string; items: InternalBookmarkItem[] }> = []
		const bookmarkPlugin = this.app.internalPlugins?.plugins?.bookmarks

		if (!bookmarkPlugin || !bookmarkPlugin.enabled) {
			return groups
		}

		const bookmarkItems = bookmarkPlugin.instance?.items
		if (!bookmarkItems) {
			return groups
		}

		bookmarkItems.forEach((item) => {
			if (item.type === 'group') {
				groups.push({
					title: item.title || '',
					items: item.items || [],
				})
			}
		})

		return groups
	}

	registerGroupCommands() {
		// Remove existing group commands
		this.groupCommands.forEach((_, id) => {
			this.app.commands?.removeCommand(`${this.manifest.id}:${id}`)
		})
		this.groupCommands.clear()

		const groups = this.getBookmarkGroups()

		groups.forEach((group) => {
			const commandId = `open-group-${this.sanitizeId(group.title)}`
			const isEnabled = this.settings.enabledGroupCommands[group.title] ?? false

			if (isEnabled) {
				this.addCommand({
					id: commandId,
					name: `Open group: ${group.title}`,
					callback: () => {
						new BookmarkGroupModal(this.app, this, group.title, group.items).open()
					},
				})
				this.groupCommands.add(commandId)
			}
		})
	}

	sanitizeId(title: string): string {
		return title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '')
	}

	getAllBookmarks(): Array<{
		id: string
		title: string
		type: string
		path?: string
	}> {
		const allBookmarks: Array<{
			id: string
			title: string
			type: string
			path?: string
		}> = []
		const bookmarkPlugin = this.app.internalPlugins?.plugins?.bookmarks

		if (!bookmarkPlugin || !bookmarkPlugin.enabled) {
			return allBookmarks
		}

		const bookmarkItems = bookmarkPlugin.instance?.items
		if (!bookmarkItems) {
			return allBookmarks
		}

		const processItem = (item: InternalBookmarkItem, parentPath = '') => {
			if (item.type === 'group') {
				const groupTitle = parentPath ? `${parentPath} > ${item.title || ''}` : item.title || ''
				if (item.items) {
					item.items.forEach((child) => processItem(child, groupTitle))
				}
			} else {
				const displayName = this.getDisplayName(item)
				const title = parentPath ? `${parentPath} > ${displayName}` : displayName
				allBookmarks.push({
					id: this.getBookmarkId(item),
					title,
					type: item.type,
					path: item.path,
				})
			}
		}

		bookmarkItems.forEach((item) => processItem(item))
		return allBookmarks
	}

	getBookmarkId(item: InternalBookmarkItem): string {
		// Create a unique ID for each bookmark based on type and path/query
		if (item.type === 'file' && item.path) {
			return `file:${item.path}`
		} else if (item.type === 'folder' && item.path) {
			return `folder:${item.path}`
		} else if (item.type === 'search' && item.query) {
			return `search:${item.query}`
		}
		return ''
	}

	isBookmarkIgnored(item: InternalBookmarkItem): boolean {
		const id = this.getBookmarkId(item)
		return this.settings.ignoredBookmarks.includes(id)
	}

	getDisplayName(item: InternalBookmarkItem): string {
		// Use custom title if available
		if (item.title) {
			return item.title
		}

		// For files and folders, extract filename without extension from path
		if (item.type === 'file' || item.type === 'folder') {
			if (item.path) {
				const pathParts = item.path.split('/')
				const filename = pathParts[pathParts.length - 1]
				// Remove file extension for files
				if (item.type === 'file') {
					return filename.replace(/\.[^/.]+$/, '')
				}
				return filename
			}
		}

		// For search, use query as fallback
		if (item.type === 'search' && item.query) {
			return item.query
		}

		return item.path || item.query || ''
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<QuickBookmarksSettings> | undefined
		)
	}

	async saveSettings() {
		await this.saveData(this.settings)
		this.registerGroupCommands()
	}
}

class BookmarksSearchModal extends FuzzySuggestModal<BookmarkItem> {
	plugin: QuickBookmarksPlugin
	parentPath: string

	override app: ObsidianAppWithInternals

	constructor(app: App, plugin: QuickBookmarksPlugin, parentPath = '') {
		super(app)
		this.plugin = plugin
		this.parentPath = parentPath
		this.app = app as ObsidianAppWithInternals
	}

	getItems(): BookmarkItem[] {
		const bookmarks: BookmarkItem[] = []
		const bookmarkPlugin = this.app.internalPlugins?.plugins?.bookmarks

		if (!bookmarkPlugin || !bookmarkPlugin.enabled) {
			return bookmarks
		}

		const bookmarkItems = bookmarkPlugin.instance?.items
		if (!bookmarkItems) {
			return bookmarks
		}

		const useSeparateModals = this.plugin.settings.groupHandling === 'separate'

		const processBookmarkItem = (item: InternalBookmarkItem, parentPath = '') => {
			if (item.type === 'group') {
				if (useSeparateModals) {
					// In separate mode, add groups as navigable items
					bookmarks.push({
						type: 'group',
						title: item.title || '',
						items: item.items,
					})
				} else {
					// In flatten mode, process children with group path
					const groupTitle = parentPath ? `${parentPath} > ${item.title || ''}` : item.title || ''
					if (item.items) {
						item.items.forEach((child) => processBookmarkItem(child, groupTitle))
					}
				}
			} else if (item.type === 'file') {
				if (!this.plugin.isBookmarkIgnored(item)) {
					const displayName = this.plugin.getDisplayName(item)
					bookmarks.push({
						type: 'file',
						title: parentPath ? `${parentPath} > ${displayName}` : displayName,
						path: item.path,
					})
				}
			} else if (item.type === 'folder') {
				if (!this.plugin.isBookmarkIgnored(item)) {
					const displayName = this.plugin.getDisplayName(item)
					bookmarks.push({
						type: 'folder',
						title: parentPath ? `${parentPath} > ${displayName}` : displayName,
						path: item.path,
					})
				}
			} else if (item.type === 'search') {
				if (!this.plugin.isBookmarkIgnored(item)) {
					const displayName = this.plugin.getDisplayName(item)
					bookmarks.push({
						type: 'search',
						title: parentPath ? `${parentPath} > ${displayName}` : displayName,
						query: item.query,
					})
				}
			}
		}

		bookmarkItems.forEach((item) => processBookmarkItem(item))
		return bookmarks
	}

	getItemText(item: BookmarkItem): string {
		return item.title
	}

	onChooseItem(item: BookmarkItem): void {
		if (item.type === 'group') {
			// Open a new modal for this group
			new BookmarkGroupModal(this.app, this.plugin, item.title, item.items || []).open()
		} else if (item.type === 'file' && item.path) {
			const file = this.app.vault.getAbstractFileByPath(item.path)
			if (file instanceof TFile) {
				void this.app.workspace.getLeaf().openFile(file)
			}
		} else if (item.type === 'folder' && item.path) {
			const folder = this.app.vault.getAbstractFileByPath(item.path)
			if (folder instanceof TFolder) {
				this.app.internalPlugins?.plugins['file-explorer']?.instance.revealInFolder(folder)
			}
		} else if (item.type === 'search' && item.query) {
			this.app.internalPlugins?.plugins['global-search']?.instance.openGlobalSearch(item.query)
		}
	}
}

class BookmarkGroupModal extends FuzzySuggestModal<BookmarkItem> {
	plugin: QuickBookmarksPlugin
	groupTitle: string
	groupItems: InternalBookmarkItem[]

	override app: ObsidianAppWithInternals

	constructor(
		app: App,
		plugin: QuickBookmarksPlugin,
		groupTitle: string,
		groupItems: InternalBookmarkItem[]
	) {
		super(app)
		this.plugin = plugin
		this.groupTitle = groupTitle
		this.groupItems = groupItems
		this.setPlaceholder(`Search in ${groupTitle}...`)
		this.app = app as ObsidianAppWithInternals
	}

	getItems(): BookmarkItem[] {
		const bookmarks: BookmarkItem[] = []

		const processBookmarkItem = (item: InternalBookmarkItem, parentPath = '') => {
			if (item.type === 'group') {
				// Nested groups - add as navigable items
				bookmarks.push({
					type: 'group',
					title: parentPath ? `${parentPath} > ${item.title || ''}` : item.title || '',
					items: item.items,
				})
			} else if (item.type === 'file') {
				if (!this.plugin.isBookmarkIgnored(item)) {
					const displayName = this.plugin.getDisplayName(item)
					bookmarks.push({
						type: 'file',
						title: parentPath ? `${parentPath} > ${displayName}` : displayName,
						path: item.path,
					})
				}
			} else if (item.type === 'folder') {
				if (!this.plugin.isBookmarkIgnored(item)) {
					const displayName = this.plugin.getDisplayName(item)
					bookmarks.push({
						type: 'folder',
						title: parentPath ? `${parentPath} > ${displayName}` : displayName,
						path: item.path,
					})
				}
			} else if (item.type === 'search') {
				if (!this.plugin.isBookmarkIgnored(item)) {
					const displayName = this.plugin.getDisplayName(item)
					bookmarks.push({
						type: 'search',
						title: parentPath ? `${parentPath} > ${displayName}` : displayName,
						query: item.query,
					})
				}
			}
		}

		this.groupItems.forEach((item) => processBookmarkItem(item))
		return bookmarks
	}

	getItemText(item: BookmarkItem): string {
		return item.title
	}

	onChooseItem(item: BookmarkItem): void {
		if (item.type === 'group') {
			// Open another modal for nested group
			new BookmarkGroupModal(this.app, this.plugin, item.title, item.items || []).open()
		} else if (item.type === 'file' && item.path) {
			const file = this.app.vault.getAbstractFileByPath(item.path)
			if (file instanceof TFile) {
				void this.app.workspace.getLeaf().openFile(file)
			}
		} else if (item.type === 'folder' && item.path) {
			const folder = this.app.vault.getAbstractFileByPath(item.path)
			if (folder instanceof TFolder) {
				this.app.internalPlugins?.plugins['file-explorer']?.instance.revealInFolder(folder)
			}
		} else if (item.type === 'search' && item.query) {
			this.app.internalPlugins?.plugins['global-search']?.instance.openGlobalSearch(item.query)
		}
	}
}

class QuickBookmarksSettingTab extends PluginSettingTab {
	plugin: QuickBookmarksPlugin

	constructor(app: App, plugin: QuickBookmarksPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	// < 1.13.0: Obsidian calls this. On 1.13.0+, getSettingDefinitions() is called instead.
	display(): void {
		const { containerEl } = this
		containerEl.empty()

		new Setting(containerEl)
			.setName('Group handling')
			.setDesc(
				"Choose how to display bookmark groups: 'separate modals' opens a new search for each group, while 'flatten all' shows all bookmarks with their group path."
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption('separate', 'Separate modals')
					.addOption('flatten', 'Flatten all')
					.setValue(this.plugin.settings.groupHandling)
					.onChange(async (value) => {
						this.plugin.settings.groupHandling = value as 'flatten' | 'separate'
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl).setName('Group commands').setHeading()
		containerEl.createEl('p', {
			text: 'Enable separate commands for specific bookmark groups. These commands will appear in the command palette.',
			cls: 'setting-item-description',
		})

		const groups = this.plugin.getBookmarkGroups()

		if (groups.length === 0) {
			containerEl.createEl('p', {
				text: 'No bookmark groups found; create groups in the bookmarks core plugin to enable group commands.',
				cls: 'setting-item-description',
			})
		} else {
			groups.forEach((group) => {
				new Setting(containerEl)
					.setName(group.title)
					.setDesc(`Enable command to open "${group.title}" group`)
					.addToggle((toggle) =>
						toggle
							.setValue(this.plugin.settings.enabledGroupCommands[group.title] ?? false)
							.onChange(async (value) => {
								this.plugin.settings.enabledGroupCommands[group.title] = value
								await this.plugin.saveSettings()
							})
					)
			})
		}

		new Setting(containerEl).setName('Ignored bookmarks').setHeading()
		containerEl.createEl('p', {
			text: 'Select bookmarks to hide from the search modal. Ignored bookmarks will not appear in search results.',
			cls: 'setting-item-description',
		})

		const allBookmarks = this.plugin.getAllBookmarks()

		if (allBookmarks.length === 0) {
			containerEl.createEl('p', {
				text: 'No bookmarks found; add bookmarks in the bookmarks core plugin to manage them here.',
				cls: 'setting-item-description',
			})
		} else {
			allBookmarks.forEach((bookmark) => {
				const typeIcon = bookmark.type === 'file' ? '📄' : bookmark.type === 'folder' ? '📁' : '🔍'
				new Setting(containerEl).setName(`${typeIcon} ${bookmark.title}`).addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.ignoredBookmarks.includes(bookmark.id))
						.setTooltip(
							this.plugin.settings.ignoredBookmarks.includes(bookmark.id)
								? 'Click to show in search'
								: 'Click to hide from search'
						)
						.onChange(async (value) => {
							if (value) {
								if (!this.plugin.settings.ignoredBookmarks.includes(bookmark.id)) {
									this.plugin.settings.ignoredBookmarks.push(bookmark.id)
								}
							} else {
								this.plugin.settings.ignoredBookmarks =
									this.plugin.settings.ignoredBookmarks.filter((id) => id !== bookmark.id)
							}
							await this.plugin.saveSettings()
						})
				)
			})
		}
	}

	getSettingDefinitions() {
		const groups = this.plugin.getBookmarkGroups()
		const allBookmarks = this.plugin.getAllBookmarks()

		return [
			{
				name: 'Group handling',
				desc: "Choose how to display bookmark groups: 'separate modals' opens a new search for each group, while 'flatten all' shows all bookmarks with their group path.",
				control: {
					type: 'dropdown',
					key: 'groupHandling',
					options: { separate: 'Separate modals', flatten: 'Flatten all' },
				},
			},
			{
				render: (el: HTMLElement) => {
					new Setting(el).setName('Group commands').setHeading()
					el.createEl('p', {
						text: 'Enable separate commands for specific bookmark groups. These commands will appear in the command palette.',
						cls: 'setting-item-description',
					})
				},
			},
			...(groups.length === 0
				? [
						{
							render: (el: HTMLElement) => {
								el.createEl('p', {
									text: 'No bookmark groups found; create groups in the bookmarks core plugin to enable group commands.',
									cls: 'setting-item-description',
								})
							},
						},
					]
				: groups.map((group) => ({
						render: (el: HTMLElement) => {
							new Setting(el)
								.setName(group.title)
								.setDesc(`Enable command to open "${group.title}" group`)
								.addToggle((toggle) =>
									toggle
										.setValue(this.plugin.settings.enabledGroupCommands[group.title] ?? false)
										.onChange(async (value) => {
											this.plugin.settings.enabledGroupCommands[group.title] = value
											await this.plugin.saveSettings()
										})
								)
						},
					}))),
			{
				render: (el: HTMLElement) => {
					new Setting(el).setName('Ignored bookmarks').setHeading()
					el.createEl('p', {
						text: 'Select bookmarks to hide from the search modal. Ignored bookmarks will not appear in search results.',
						cls: 'setting-item-description',
					})
				},
			},
			...(allBookmarks.length === 0
				? [
						{
							render: (el: HTMLElement) => {
								el.createEl('p', {
									text: 'No bookmarks found; add bookmarks in the bookmarks core plugin to manage them here.',
									cls: 'setting-item-description',
								})
							},
						},
					]
				: allBookmarks.map((bookmark) => ({
						render: (el: HTMLElement) => {
							const typeIcon =
								bookmark.type === 'file' ? '📄' : bookmark.type === 'folder' ? '📁' : '🔍'
							new Setting(el)
								.setName(`${typeIcon} ${bookmark.title}`)
								.addToggle((toggle) =>
									toggle
										.setValue(this.plugin.settings.ignoredBookmarks.includes(bookmark.id))
										.setTooltip(
											this.plugin.settings.ignoredBookmarks.includes(bookmark.id)
												? 'Click to show in search'
												: 'Click to hide from search'
										)
										.onChange(async (value) => {
											if (value) {
												if (!this.plugin.settings.ignoredBookmarks.includes(bookmark.id)) {
													this.plugin.settings.ignoredBookmarks.push(bookmark.id)
												}
											} else {
												this.plugin.settings.ignoredBookmarks =
													this.plugin.settings.ignoredBookmarks.filter(
														(id) => id !== bookmark.id
													)
											}
											await this.plugin.saveSettings()
										})
								)
						},
					}))),
		]
	}
}
