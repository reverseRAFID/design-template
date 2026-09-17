/**
 * POST /api/manifest — save the sponsor board to the repo.
 *
 * The board lives in `public/brand/sponsors/manifest.json`, in git (D30). On a
 * static host there is nowhere to write it, so SAVE POSITIONS could only download
 * the file and ask someone to commit it by hand. This function closes that loop:
 * it commits the file through the GitHub API, Vercel redeploys, and the board
 * follows the project rather than the browser it was arranged in (D33).
 *
 * The repo stays the single source of truth. Nothing is stored here.
 *
 * Reached as `/__manifest` too — vercel.json rewrites it — so the app has one
 * endpoint whether it is talking to the dev server or to this.
 */

import {
  KEY_HEADER,
  MANIFEST_FILE,
  authorised,
  commitBody,
  contentsUrl,
  isRejection,
  parseManifest,
  readConfig,
  serialize,
} from './_commit';

const JSON_HEADERS = { 'content-type': 'application/json' };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  const config = readConfig(process.env);
  // Saving is not configured on this deployment: say so plainly and let the app
  // fall back to downloading the file.
  if (!config) return json(503, { error: 'saving is not configured on this deployment' });

  if (!authorised(request.headers.get(KEY_HEADER), config.key)) {
    return json(401, { error: 'save key rejected' });
  }

  const body = await request.text();
  const parsed = parseManifest(body);
  if (isRejection(parsed)) return json(parsed.status, { error: parsed.message });

  const url = contentsUrl(config.repo);
  const auth = {
    authorization: `Bearer ${config.token}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'mongoltori-brandkit',
  };

  // The blob being replaced. A 404 means the file is not in the repo yet, which is
  // a create rather than an update — every other failure is fatal, because
  // committing without the sha would overwrite whatever is there.
  let sha: string | undefined;
  const head = await fetch(`${url}?ref=${encodeURIComponent(config.branch)}`, { headers: auth });
  if (head.ok) {
    const current: unknown = await head.json();
    const found = (current as { sha?: unknown }).sha;
    if (typeof found === 'string') sha = found;
  } else if (head.status !== 404) {
    return json(502, { error: `github said ${head.status} reading the current file` });
  }

  const who = request.headers.get('x-mt-save-by')?.slice(0, 60) || 'the brand kit';
  const write = await fetch(url, {
    method: 'PUT',
    headers: { ...auth, ...JSON_HEADERS },
    body: JSON.stringify(commitBody(serialize(parsed.manifest), config.branch, sha, who)),
  });

  if (!write.ok) {
    // 409 is the one worth naming: someone else saved between our read and write.
    const reason =
      write.status === 409
        ? 'the board changed in the repo while you were saving — reload and try again'
        : `github said ${write.status}`;
    return json(write.status === 409 ? 409 : 502, { error: reason });
  }

  const result: unknown = await write.json();
  const commit = (result as { commit?: { sha?: unknown } }).commit?.sha;

  return json(200, {
    written: MANIFEST_FILE,
    commit: typeof commit === 'string' ? commit.slice(0, 7) : null,
  });
}

/** Anything else is a mistake, and saying so beats a confusing 404. */
export function GET(): Response {
  return json(405, { error: 'POST the manifest here' });
}
