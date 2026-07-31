// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useLocalStorage } from '#/hooks/use-local-storage';

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('useLocalStorage', () => {
  it('reads, writes, and removes a string value', () => {
    window.localStorage.setItem('working-directory', '/Users/example/first');

    const { result } = renderHook(() => useLocalStorage('working-directory'));

    expect(result.current[0]).toBe('/Users/example/first');

    act(() => result.current[1]('/Users/example/second'));
    expect(result.current[0]).toBe('/Users/example/second');
    expect(window.localStorage.getItem('working-directory')).toBe('/Users/example/second');

    act(() => result.current[1](undefined));
    expect(result.current[0]).toBeUndefined();
    expect(window.localStorage.getItem('working-directory')).toBeNull();
  });
});
