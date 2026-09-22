type BookmarkItemType = 'file' | 'folder' | 'search' | 'group'

interface InternalBookmarkItem {
	type: BookmarkItemType
	title?: string
	path?: string
	query?: string
	items?: InternalBookmarkItem[]
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
