import { describe, expect, it } from 'vitest';
import { originChecker } from './origins.ts';

describe('allowed origins', () => {
  it('allows everything when no list is set (local dev)', () => {
    expect(originChecker([])('https://anything.example')).toBe(true);
    expect(originChecker(['*'])('https://anything.example')).toBe(true);
  });

  it('matches the production site exactly', () => {
    const ok = originChecker(['https://saber-side.netlify.app']);
    expect(ok('https://saber-side.netlify.app')).toBe(true);
    expect(ok('https://saber-side.netlify.app.evil.com')).toBe(false);
    expect(ok('http://saber-side.netlify.app')).toBe(false);
    expect(ok('https://xsaber-side.netlify.app')).toBe(false);
  });

  it("lets a wildcard cover Netlify's deploy previews, within one part of the hostname", () => {
    const ok = originChecker(['https://saber-side.netlify.app', 'https://*--saber-side.netlify.app']);
    expect(ok('https://deploy-preview-12--saber-side.netlify.app')).toBe(true);
    expect(ok('https://main--saber-side.netlify.app')).toBe(true);
    expect(ok('https://evil.com.x--saber-side.netlify.app')).toBe(false);
    expect(ok('https://evil.com/--saber-side.netlify.app')).toBe(false);
  });

  it('ignores case and trailing slashes in the list', () => {
    expect(originChecker(['https://Saber-Side.netlify.app/'])('https://saber-side.netlify.app')).toBe(true);
  });

  it('allows requests that send no Origin (health checks, bots)', () => {
    const ok = originChecker(['https://saber-side.netlify.app']);
    expect(ok(undefined)).toBe(true);
    expect(ok(null)).toBe(true);
  });
});
