import {
	App,
	FuzzySuggestModal,
	Plugin,
	PluginSettingTab,
	Setting,
	type SettingDefinitionItem,
	TFile,
	TFolder,
} from 'obsidian'
import {
	type BookmarkItem,
	buildBookmarkItems,
	getBookmarkId,
	getBookmarkItems,
	type InternalBookmarkItem,
	sanitizeId,
} from './utils'

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

		getBookmarkItems(this.app).forEach((item) => {
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
			const commandId = `open-group-${sanitizeId(group.title)}`
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

	getAllBookmarks(): Array<{
		id: string
		title: string
		type: string
		path?: string
	}> {
		// Settings tab needs every bookmark, including ignored ones, so they can be toggled back on.
		const items = buildBookmarkItems(getBookmarkItems(this.app), { flatten: true, isIgnored: () => false })
		return items.map((item) => ({
			id: getBookmarkId(item),
			title: item.title,
			type: item.type,
			path: item.path,
		}))
	}

	isBookmarkIgnored(item: InternalBookmarkItem): boolean {
		const id = getBookmarkId(item)
		return this.settings.ignoredBookmarks.includes(id)
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

// Obsidian's `obsidian` package ships types only (no runtime TFile/TFolder classes),
// so instanceof checks here can't run without a live Obsidian App.
// fallow-ignore-next-line complexity
function openBookmarkItem(
	app: ObsidianAppWithInternals,
	plugin: QuickBookmarksPlugin,
	item: BookmarkItem
): void {
	if (item.type === 'group') {
		new BookmarkGroupModal(app, plugin, item.title, item.items || []).open()
	} else if (item.type === 'file' && item.path) {
		const file = app.vault.getAbstractFileByPath(item.path)
		if (file instanceof TFile) {
			void app.workspace.getLeaf().openFile(file)
		}
	} else if (item.type === 'folder' && item.path) {
		const folder = app.vault.getAbstractFileByPath(item.path)
		if (folder instanceof TFolder) {
			app.internalPlugins?.plugins['file-explorer']?.instance.revealInFolder(folder)
		}
	} else if (item.type === 'search' && item.query) {
		app.internalPlugins?.plugins['global-search']?.instance.openGlobalSearch(item.query)
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
		this.app = app
	}

	getItems(): BookmarkItem[] {
		return buildBookmarkItems(getBookmarkItems(this.app), {
			flatten: this.plugin.settings.groupHandling === 'flatten',
			isIgnored: (item) => this.plugin.isBookmarkIgnored(item),
		})
	}

	getItemText(item: BookmarkItem): string {
		return item.title
	}

	onChooseItem(item: BookmarkItem): void {
		openBookmarkItem(this.app, this.plugin, item)
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
		this.app = app
	}

	getItems(): BookmarkItem[] {
		// Nested groups always stay navigable, regardless of the top-level group setting.
		return buildBookmarkItems(this.groupItems, {
			flatten: false,
			isIgnored: (item) => this.plugin.isBookmarkIgnored(item),
		})
	}

	getItemText(item: BookmarkItem): string {
		return item.title
	}

	onChooseItem(item: BookmarkItem): void {
		openBookmarkItem(this.app, this.plugin, item)
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

	getSettingDefinitions(): SettingDefinitionItem[] {
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
				type: 'group',
				heading: 'Group commands',
				items:
					groups.length === 0
						? [
								{
									name: 'No bookmark groups found',
									desc: 'Create groups in the bookmarks core plugin to enable group commands.',
								},
							]
						: groups.map((group) => ({
								name: group.title,
								desc: `Enable command to open "${group.title}" group`,
								render: (setting: Setting) => {
									setting.addToggle((toggle) =>
										toggle
											.setValue(this.plugin.settings.enabledGroupCommands[group.title] ?? false)
											.onChange(async (value) => {
												this.plugin.settings.enabledGroupCommands[group.title] = value
												await this.plugin.saveSettings()
											})
									)
								},
							})),
			},
			{
				type: 'group',
				heading: 'Ignored bookmarks',
				items:
					allBookmarks.length === 0
						? [
								{
									name: 'No bookmarks found',
									desc: 'Add bookmarks in the bookmarks core plugin to manage them here.',
								},
							]
						: allBookmarks.map((bookmark) => ({
								name: `${bookmark.type === 'file' ? '📄' : bookmark.type === 'folder' ? '📁' : '🔍'} ${bookmark.title}`,
								render: (setting: Setting) => {
									setting.addToggle((toggle) =>
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
							})),
			},
		]
	}
}
