import { describe, expect, it } from 'vitest';

import {
  MANIFEST_FILE,
  MAX_BYTES,
  authorised,
  commitBody,
  contentsUrl,
  isRejection,
  parseManifest,
  readConfig,
  serialize,
} from '../api/manifest';

/**
 * The save endpoint commits to the repo, so its gatekeeping is the part that has
 * to be right: a wrong key must not write, and a body that is not a sponsor
 * board must not land in git where every client would then fail to parse it
 * (docs/DECISIONS.md D33).
 */

const BOARD = {
  version: 1,
  tiers: { 1: 'Platinum' },
  sponsors: [
    { slug: 'a', name: 'A', tier: 1, order: 1 },
    { slug: 'b', name: 'B', tier: 2, order: 1 },
  ],
};

describe('readConfig', () => {
  const full = {
    MT_GITHUB_TOKEN: 'tok',
    MT_GITHUB_REPO: 'team/brandkit',
    MT_SAVE_KEY: 'secret',
  };

  it('defaults the branch to main', () => {
    expect(readConfig(full)?.branch).toBe('main');
  });

  it('takes the branch when one is given', () => {
    expect(readConfig({ ...full, MT_GITHUB_BRANCH: 'production' })?.branch).toBe('production');
  });

  it.each(['MT_GITHUB_TOKEN', 'MT_GITHUB_REPO', 'MT_SAVE_KEY'])(
    'is unconfigured when %s is missing, so the app falls back to downloading',
    (missing) => {
      const partial = { ...full, [missing]: undefined };
      expect(readConfig(partial)).toBeNull();
    },
  );

  it('treats blank and whitespace-only values as missing', () => {
    expect(readConfig({ ...full, MT_SAVE_KEY: '   ' })).toBeNull();
  });
});

describe('authorised', () => {
  it('accepts the exact key', () => {
    expect(authorised('secret', 'secret')).toBe(true);
  });

  it('rejects a wrong key of the same length', () => {
    expect(authorised('secres', 'secret')).toBe(false);
  });

  it('rejects a prefix of the key', () => {
    expect(authorised('sec', 'secret')).toBe(false);
  });

  it('rejects a missing header rather than throwing', () => {
    expect(authorised(null, 'secret')).toBe(false);
    expect(authorised('', 'secret')).toBe(false);
  });

  it('compares bytes, not characters, so a multi-byte key still works', () => {
    expect(authorised('kéy', 'kéy')).toBe(true);
    expect(authorised('key', 'kéy')).toBe(false);
  });
});

describe('parseManifest', () => {
  it('accepts a board', () => {
    const out = parseManifest(JSON.stringify(BOARD));
    expect(isRejection(out)).toBe(false);
  });

  it('rejects anything that is not JSON', () => {
    const out = parseManifest('<!doctype html>');
    expect(isRejection(out) && out.status).toBe(400);
  });

  it('rejects valid JSON that is not a board', () => {
    const out = parseManifest(JSON.stringify({ hello: 'world' }));
    expect(isRejection(out) && out.status).toBe(400);
  });

  it('rejects an empty sponsor list, which would blank the strip', () => {
    const out = parseManifest(JSON.stringify({ ...BOARD, sponsors: [] }));
    expect(isRejection(out) && out.status).toBe(400);
  });

  it('rejects entries missing the fields the board is made of', () => {
    const out = parseManifest(JSON.stringify({ sponsors: [{ slug: 'a', tier: 1 }] }));
    expect(isRejection(out) && out.status).toBe(400);
  });

  it('rejects a body over the size cap before parsing it', () => {
    const out = parseManifest('x'.repeat(MAX_BYTES + 1));
    expect(isRejection(out) && out.status).toBe(413);
  });
});

describe('commit shape', () => {
  it('writes only the manifest path, never one from the request', () => {
    expect(MANIFEST_FILE).toBe('public/brand/sponsors/manifest.json');
    expect(contentsUrl('team/brandkit')).toBe(
      'https://api.github.com/repos/team/brandkit/contents/public/brand/sponsors/manifest.json',
    );
  });

  it('serialises exactly as the repo stores it, so an unchanged board is an empty diff', () => {
    expect(serialize(BOARD)).toBe(`${JSON.stringify(BOARD, null, 2)}\n`);
  });

  it('round-trips the content through base64', () => {
    const json = serialize(BOARD);
    const body = commitBody(json, 'main', 'abc123', 'the brand kit');
    expect(Buffer.from(body.content, 'base64').toString('utf8')).toBe(json);
    expect(body.branch).toBe('main');
    expect(body.sha).toBe('abc123');
  });

  it('omits sha when the file does not exist yet, which is how GitHub tells create from update', () => {
    expect(commitBody('{}\n', 'main', undefined, 'x').sha).toBeUndefined();
  });

  it('names the saver in the commit message body, not the subject', () => {
    const { message } = commitBody('{}\n', 'main', undefined, 'the brand kit');
    expect(message.split('\n')[0]).toBe('chore(sponsors): update board from the brand kit');
  });
});

/**
 * The failure this guards against is invisible to the type checker and to the
 * build: with `"type": "module"`, an extensionless relative import cannot be
 * resolved at runtime, so the function dies with ERR_MODULE_NOT_FOUND on its
 * first request and Vercel reports only FUNCTION_INVOCATION_FAILED. Keeping the
 * file self-contained is the guarantee (docs/DECISIONS.md D35).
 */
describe('the deployed function', () => {
  it('imports nothing, so there is nothing for the runtime to fail to resolve', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('../api/manifest.ts', import.meta.url), 'utf8');
    const imports = source.match(/^\s*import\s.+$/gm) ?? [];
    expect(imports).toEqual([]);
  });
});
