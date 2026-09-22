import { describe, expect, it } from 'vitest'
import {
	buildBookmarkItems,
	getBookmarkId,
	getBookmarkItems,
	getDisplayName,
	type InternalBookmarkItem,
	isIdIgnored,
	sanitizeId,
} from './utils'

describe('isIdIgnored', () => {
	it('returns true when the id is in the ignored list', () => {
		expect(isIdIgnored('file:a.md', ['file:a.md'])).toBe(true)
	})

	it('returns false when the id is not in the ignored list', () => {
		expect(isIdIgnored('file:a.md', ['file:b.md'])).toBe(false)
	})

	it('returns false for an empty id even if "" is in the list', () => {
		expect(isIdIgnored('', [''])).toBe(false)
	})
})

describe('getBookmarkItems', () => {
	it('returns items when the bookmarks plugin is enabled', () => {
		const items: InternalBookmarkItem[] = [{ type: 'file', path: 'a.md' }]
		const app = { internalPlugins: { plugins: { bookmarks: { enabled: true, instance: { items } } } } }
		expect(getBookmarkItems(app)).toBe(items)
	})

	it('returns an empty array when the bookmarks plugin is disabled', () => {
		const app = {
			internalPlugins: {
				plugins: { bookmarks: { enabled: false, instance: { items: [] } } },
			},
		}
		expect(getBookmarkItems(app)).toEqual([])
	})

	it('returns an empty array when the bookmarks plugin is missing', () => {
		expect(getBookmarkItems({})).toEqual([])
	})

	it('returns an empty array when instance/items is missing', () => {
		const app = { internalPlugins: { plugins: { bookmarks: { enabled: true } } } }
		expect(getBookmarkItems(app)).toEqual([])
	})
})

describe('sanitizeId', () => {
	it('lowercases and hyphenates', () => {
		expect(sanitizeId('My Group')).toBe('my-group')
	})

	it('strips leading/trailing hyphens', () => {
		expect(sanitizeId('  Weird!! Title??  ')).toBe('weird-title')
	})
})

describe('getBookmarkId', () => {
	it('builds a file id', () => {
		expect(getBookmarkId({ type: 'file', path: 'notes/a.md' })).toBe('file:notes/a.md')
	})

	it('builds a folder id', () => {
		expect(getBookmarkId({ type: 'folder', path: 'notes' })).toBe('folder:notes')
	})

	it('builds a search id', () => {
		expect(getBookmarkId({ type: 'search', query: 'tag:#todo' })).toBe('search:tag:#todo')
	})

	it('returns empty string for a group', () => {
		expect(getBookmarkId({ type: 'group' })).toBe('')
	})

	it('returns empty string when path/query is missing', () => {
		expect(getBookmarkId({ type: 'file' })).toBe('')
	})
})

describe('getDisplayName', () => {
	it('prefers a custom title over path', () => {
		expect(getDisplayName({ type: 'file', path: 'notes/a.md', title: 'Custom' })).toBe('Custom')
	})

	it('strips extension from file path when no title', () => {
		expect(getDisplayName({ type: 'file', path: 'notes/a.md' })).toBe('a')
	})

	it('keeps folder name as-is when no title', () => {
		expect(getDisplayName({ type: 'folder', path: 'notes/sub' })).toBe('sub')
	})

	it('falls back to query for search when no title', () => {
		expect(getDisplayName({ type: 'search', query: 'tag:#todo' })).toBe('tag:#todo')
	})

	it('falls back to empty string when nothing available', () => {
		expect(getDisplayName({ type: 'group' })).toBe('')
	})
})

describe('buildBookmarkItems', () => {
	const notIgnored = () => false

	it('flattens groups into path-prefixed items when flatten is true', () => {
		const items: InternalBookmarkItem[] = [
			{
				type: 'group',
				title: 'Work',
				items: [{ type: 'file', path: 'notes/a.md' }],
			},
		]
		const result = buildBookmarkItems(items, { flatten: true, isIgnored: notIgnored })
		expect(result).toEqual([{ type: 'file', title: 'Work > a', path: 'notes/a.md', query: undefined }])
	})

	it('keeps groups as navigable items when flatten is false', () => {
		const groupItems: InternalBookmarkItem[] = [{ type: 'file', path: 'notes/a.md' }]
		const items: InternalBookmarkItem[] = [{ type: 'group', title: 'Work', items: groupItems }]
		const result = buildBookmarkItems(items, { flatten: false, isIgnored: notIgnored })
		expect(result).toEqual([{ type: 'group', title: 'Work', items: groupItems }])
	})

	it('skips items the isIgnored callback flags', () => {
		const items: InternalBookmarkItem[] = [
			{ type: 'file', path: 'notes/a.md' },
			{ type: 'file', path: 'notes/b.md' },
		]
		const result = buildBookmarkItems(items, {
			flatten: true,
			isIgnored: (item) => item.path === 'notes/b.md',
		})
		expect(result).toEqual([{ type: 'file', title: 'a', path: 'notes/a.md', query: undefined }])
	})
})
