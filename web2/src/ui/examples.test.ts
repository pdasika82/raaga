// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { exampleSearch } from './examples';

it('opens a real YouTube search for the current lesson and supports custom topics', () => {
  const el = exampleSearch('Kuchipudi beginner adavus');
  const link = el.querySelector('a')!;
  expect(new URL(link.href).searchParams.get('search_query')).toBe('Kuchipudi beginner adavus');
  const input = el.querySelector('input')!; input.value = 'Sarali swaralu 1 & 2'; input.dispatchEvent(new Event('input'));
  expect(new URL(link.href).hostname).toBe('www.youtube.com');
  expect(new URL(link.href).searchParams.get('search_query')).toBe('Sarali swaralu 1 & 2');
  expect(link.rel).toBe('noopener noreferrer');
});
