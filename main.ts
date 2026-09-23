import {
	App,
	type FuzzyMatch,
	FuzzySuggestModal,
	Plugin,
	PluginSettingTab,
	setIcon,
	Setting,
	type SettingDefinitionItem,
	TFile,
	TFolder,
	type ToggleComponent,
} from 'obsidian'
import {
	type BookmarkItem,
	bookmarkTypeIcon,
	type BookmarkItemType,
	bookmarkTypeLucideIcon,
	buildBookmarkItems,
	getBookmarkId,
	getBookmarkItems,
	type InternalBookmarkItem,
	isIdIgnored,
	sanitizeId,
} from './utils'

function renderBookmarkSuggestion(item: BookmarkItem, el: HTMLElement): void {
	el.empty()
	const iconEl = el.createSpan({ cls: 'quick-bookmarks-suggestion-icon' })
	setIcon(iconEl, bookmarkTypeLucideIcon(item.type))
	el.createSpan({ text: item.title })
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

		this.addCommand({
			id: 'open-bookmarks-search-flattened',
			name: 'Search all bookmarks (flattened)',
			callback: () => {
				new BookmarksSearchModal(this.app, this, '', true).open()
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
						new BookmarkGroupModal(this.app, this, group.title).open()
					},
				})
				this.groupCommands.add(commandId)
			}
		})
	}

	getAllBookmarks(): Array<{
		id: string
		title: string
		type: BookmarkItemType
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
		return isIdIgnored(getBookmarkId(item), this.settings.ignoredBookmarks)
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
		new BookmarkGroupModal(app, plugin, item.title).open()
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
	forceFlatten: boolean

	override app: ObsidianAppWithInternals

	constructor(app: App, plugin: QuickBookmarksPlugin, parentPath = '', forceFlatten = false) {
		super(app)
		this.plugin = plugin
		this.parentPath = parentPath
		this.forceFlatten = forceFlatten
		this.app = app
	}

	getItems(): BookmarkItem[] {
		return buildBookmarkItems(getBookmarkItems(this.app), {
			flatten: this.forceFlatten || this.plugin.settings.groupHandling === 'flatten',
			isIgnored: (item) => this.plugin.isBookmarkIgnored(item),
		})
	}

	getItemText(item: BookmarkItem): string {
		return item.title
	}

	renderSuggestion(item: FuzzyMatch<BookmarkItem>, el: HTMLElement): void {
		renderBookmarkSuggestion(item.item, el)
	}

	onChooseItem(item: BookmarkItem): void {
		openBookmarkItem(this.app, this.plugin, item)
	}
}

class BookmarkGroupModal extends FuzzySuggestModal<BookmarkItem> {
	plugin: QuickBookmarksPlugin
	groupTitle: string

	override app: ObsidianAppWithInternals

	constructor(app: App, plugin: QuickBookmarksPlugin, groupTitle: string) {
		super(app)
		this.plugin = plugin
		this.groupTitle = groupTitle
		this.setPlaceholder(`Search in ${groupTitle}...`)
		this.app = app
	}

	getItems(): BookmarkItem[] {
		// Nested groups always stay navigable, regardless of the top-level group setting.
		// Fetched fresh (not cached) so edits made in Obsidian's Bookmarks pane show up immediately.
		const groupItems = this.plugin.getBookmarkGroups().find((g) => g.title === this.groupTitle)?.items ?? []
		return buildBookmarkItems(groupItems, {
			flatten: false,
			isIgnored: (item) => this.plugin.isBookmarkIgnored(item),
		})
	}

	getItemText(item: BookmarkItem): string {
		return item.title
	}

	renderSuggestion(item: FuzzyMatch<BookmarkItem>, el: HTMLElement): void {
		renderBookmarkSuggestion(item.item, el)
	}

	onChooseItem(item: BookmarkItem): void {
		openBookmarkItem(this.app, this.plugin, item)
	}
}

function configureGroupToggle(
	toggle: ToggleComponent,
	group: { title: string },
	plugin: QuickBookmarksPlugin
): ToggleComponent {
	return toggle.setValue(plugin.settings.enabledGroupCommands[group.title] ?? false).onChange(async (value) => {
		plugin.settings.enabledGroupCommands[group.title] = value
		await plugin.saveSettings()
		plugin.registerGroupCommands()
	})
}

function configureIgnoreToggle(
	toggle: ToggleComponent,
	bookmark: { id: string },
	plugin: QuickBookmarksPlugin
): ToggleComponent {
	const isIgnored = plugin.settings.ignoredBookmarks.includes(bookmark.id)
	return toggle
		.setDisabled(bookmark.id === '')
		.setValue(isIgnored)
		.setTooltip(
			bookmark.id === ''
				? "Can't hide this bookmark (missing path/query)"
				: isIgnored
					? 'Click to show in search'
					: 'Click to hide from search'
		)
		.onChange(async (value) => {
			if (value) {
				if (!plugin.settings.ignoredBookmarks.includes(bookmark.id)) {
					plugin.settings.ignoredBookmarks.push(bookmark.id)
				}
			} else {
				plugin.settings.ignoredBookmarks = plugin.settings.ignoredBookmarks.filter(
					(id) => id !== bookmark.id
				)
			}
			await plugin.saveSettings()
		})
}

class QuickBookmarksSettingTab extends PluginSettingTab {
	plugin: QuickBookmarksPlugin

	constructor(app: App, plugin: QuickBookmarksPlugin) {
		super(app, plugin)
		this.plugin = plugin
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
									setting.addToggle((toggle) => configureGroupToggle(toggle, group, this.plugin))
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
								name: `${bookmarkTypeIcon(bookmark.type)} ${bookmark.title}`,
								render: (setting: Setting) => {
									setting.addToggle((toggle) => configureIgnoreToggle(toggle, bookmark, this.plugin))
								},
							})),
			},
		]
	}
}
