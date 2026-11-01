import { describe, expect, it } from 'vitest';
import { originChecker } from './origins.ts';

describe('allowed origins', () => {
  it('allows everything when no list is set (local dev)', () => {
    expect(originChecker([])('https://anything.example')).toBe(true);
    expect(originChecker(['*'])('https://anything.example')).toBe(true);
  });

  it('matches the production site exactly', () => {
    const ok = originChecker(['https://saber-side.onrender.com']);
    expect(ok('https://saber-side.onrender.com')).toBe(true);
    expect(ok('https://saber-side.onrender.com.evil.com')).toBe(false);
    expect(ok('http://saber-side.onrender.com')).toBe(false);
    expect(ok('https://xsaber-side.onrender.com')).toBe(false);
  });

  it("lets a wildcard cover the game's PR previews, within one part of the hostname", () => {
    const ok = originChecker(['https://saber-side.onrender.com', 'https://saber-side-pr-*.onrender.com']);
    expect(ok('https://saber-side-pr-12.onrender.com')).toBe(true);
    expect(ok('https://saber-side-pr-3.onrender.com')).toBe(true);
    expect(ok('https://saber-side-pr-.evil.com.onrender.com')).toBe(false);
    expect(ok('https://saber-side-pr-1.evil.com/.onrender.com')).toBe(false);
  });

  it('ignores case and trailing slashes in the list', () => {
    expect(originChecker(['https://Saber-Side.onrender.com/'])('https://saber-side.onrender.com')).toBe(true);
  });

  it('allows requests that send no Origin (health checks, bots)', () => {
    const ok = originChecker(['https://saber-side.onrender.com']);
    expect(ok(undefined)).toBe(true);
    expect(ok(null)).toBe(true);
  });
});
