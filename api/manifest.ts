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
 *
 * The signature is the Node one, `(req, res)`. Named `GET`/`POST` exports are a
 * Next.js convention; a plain function in `api/` gets invoked the Node way, and
 * exporting the wrong shape is an invocation crash, not a build error (D35).
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

/** The slice of Node's req/res this uses — typed here so the file needs no deps. */
interface ApiRequest extends AsyncIterable<Uint8Array> {
  method?: string | undefined;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ApiResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(chunk?: string): void;
}

function send(res: ApiResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function header(req: ApiRequest, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * The platform may hand over a parsed object, a string, a Buffer, or nothing at
 * all and leave the stream to be read. Normalise all four to the raw text, since
 * that is what gets committed.
 */
async function readBody(req: ApiRequest): Promise<string> {
  const { body } = req;
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return Buffer.from(body).toString('utf8');
  if (body && typeof body === 'object') return JSON.stringify(body);

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    send(res, 405, { error: 'POST the manifest here' });
    return;
  }

  const config = readConfig(process.env);
  // Saving is not configured on this deployment: say so plainly and let the app
  // fall back to downloading the file.
  if (!config) {
    send(res, 503, { error: 'saving is not configured on this deployment' });
    return;
  }

  if (!authorised(header(req, KEY_HEADER), config.key)) {
    send(res, 401, { error: 'save key rejected' });
    return;
  }

  const parsed = parseManifest(await readBody(req));
  if (isRejection(parsed)) {
    send(res, parsed.status, { error: parsed.message });
    return;
  }

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
    send(res, 502, { error: `github said ${head.status} reading the current file` });
    return;
  }

  const who = header(req, 'x-mt-save-by')?.slice(0, 60) || 'the brand kit';
  const write = await fetch(url, {
    method: 'PUT',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify(commitBody(serialize(parsed.manifest), config.branch, sha, who)),
  });

  if (!write.ok) {
    // 409 is the one worth naming: someone else saved between our read and write.
    if (write.status === 409) {
      send(res, 409, {
        error: 'the board changed in the repo while you were saving — reload and try again',
      });
      return;
    }
    send(res, 502, { error: `github said ${write.status}` });
    return;
  }

  const result: unknown = await write.json();
  const commit = (result as { commit?: { sha?: unknown } }).commit?.sha;

  send(res, 200, {
    written: MANIFEST_FILE,
    commit: typeof commit === 'string' ? commit.slice(0, 7) : null,
  });
}
