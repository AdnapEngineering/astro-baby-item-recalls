import { describe, expect, it } from 'vitest';
import { isActive, isInSection, withBase } from './nav';

describe('isActive', () => {
  it('matches the same page with or without a trailing slash', () => {
    expect(isActive(withBase('/products'), withBase('/products/'))).toBe(true);
    expect(isActive(withBase('/products/toys/'), withBase('/products/'))).toBe(false);
  });
});

describe('isInSection', () => {
  it('matches a section page and every page beneath it', () => {
    expect(isInSection(withBase('/products/'), withBase('/products/'))).toBe(true);
    expect(isInSection(withBase('/products/toys/2/'), withBase('/products/'))).toBe(true);
    expect(isInSection(withBase('/recalls/42/'), withBase('/recalls/'))).toBe(true);
  });

  it('does not match a sibling whose name merely starts the same', () => {
    expect(isInSection(withBase('/products-old/'), withBase('/products/'))).toBe(false);
  });

  it('only lights the home link on the home page', () => {
    expect(isInSection(withBase('/'), withBase('/'))).toBe(true);
    expect(isInSection(withBase('/hazards/'), withBase('/'))).toBe(false);
  });
});
