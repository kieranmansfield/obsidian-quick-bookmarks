import { describe, expect, it } from 'vitest'
import { getBookmarkId, getDisplayName, sanitizeId } from './utils'

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
