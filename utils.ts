export type BookmarkItemType = 'file' | 'folder' | 'search' | 'group'

export interface InternalBookmarkItem {
	type: BookmarkItemType
	title?: string
	path?: string
	query?: string
	items?: InternalBookmarkItem[]
}

export interface BookmarkItem {
	type: BookmarkItemType
	title: string
	path?: string
	query?: string
	items?: InternalBookmarkItem[]
}

export function bookmarkTypeIcon(type: BookmarkItemType): string {
	if (type === 'file') return '📄'
	if (type === 'folder') return '📁'
	return '🔍'
}

export function bookmarkTypeLucideIcon(type: BookmarkItemType): string {
	if (type === 'file') return 'file'
	if (type === 'folder') return 'folder'
	if (type === 'group') return 'folder-open'
	return 'search'
}

interface BookmarksPluginHost {
	internalPlugins?: {
		plugins?: {
			bookmarks?: {
				enabled: boolean
				instance?: { items: InternalBookmarkItem[] }
			}
		}
	}
}

export function getBookmarkItems(app: BookmarksPluginHost): InternalBookmarkItem[] {
	const bookmarkPlugin = app.internalPlugins?.plugins?.bookmarks
	if (!bookmarkPlugin || !bookmarkPlugin.enabled) {
		return []
	}
	return bookmarkPlugin.instance?.items || []
}

export function sanitizeId(title: string): string {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
}

export function getBookmarkId(item: InternalBookmarkItem): string {
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

export function isIdIgnored(id: string, ignoredBookmarks: string[]): boolean {
	// An empty id means the bookmark has no path/query to identify it; treating it as
	// ignorable would silently hide every other malformed bookmark that also resolves to ''.
	return id !== '' && ignoredBookmarks.includes(id)
}

export function getDisplayName(item: InternalBookmarkItem): string {
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

interface BuildBookmarkItemsOptions {
	// When true, groups are expanded inline with a "Group > Item" path prefix
	// instead of appearing as their own navigable item.
	flatten: boolean
	isIgnored: (item: InternalBookmarkItem) => boolean
}

function withPathPrefix(parentPath: string, name: string): string {
	return parentPath ? `${parentPath} > ${name}` : name
}

export function buildBookmarkItems(
	items: InternalBookmarkItem[],
	{ flatten, isIgnored }: BuildBookmarkItemsOptions
): BookmarkItem[] {
	const bookmarks: BookmarkItem[] = []

	const processGroup = (item: InternalBookmarkItem, groupTitle: string) => {
		if (flatten) {
			item.items?.forEach((child) => processItem(child, groupTitle))
		} else {
			bookmarks.push({ type: 'group', title: groupTitle, items: item.items })
		}
	}

	const processItem = (item: InternalBookmarkItem, parentPath = '') => {
		const title = withPathPrefix(parentPath, item.title || '')

		if (item.type === 'group') {
			processGroup(item, title)
			return
		}

		if (isIgnored(item)) {
			return
		}

		bookmarks.push({
			type: item.type,
			title: withPathPrefix(parentPath, getDisplayName(item)),
			path: item.path,
			query: item.query,
		})
	}

	items.forEach((item) => processItem(item))
	return bookmarks
}
