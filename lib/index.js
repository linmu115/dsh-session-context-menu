export const name = 'dsh-session-context-menu'

export const inject = ['webServer', 'workspaceRegistry']

const ENDPOINT = '/dsh-session-context-menu/worktree'
const MAX_BODY_BYTES = 64 * 1024

function sendJson(res, status, value) {
  const body = Buffer.from(JSON.stringify(value))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let bytes = 0
    req.on('data', chunk => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) {
        reject(new Error('请求内容过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(new Error('请求不是有效 JSON'))
      }
    })
    req.on('error', reject)
  })
}

async function createWorktree(ctx, input) {
  const workspaceId = String(input?.workspaceId ?? '').trim()
  const name = String(input?.name ?? '').trim()
  const baseCommit = String(input?.baseCommit ?? '').trim()
  if (workspaceId === '') throw new Error('缺少工作区 ID')
  if (name === '') throw new Error('工作树名称不能为空')

  const workspace = ctx.workspaceRegistry.get(workspaceId)
  if (workspace === undefined) throw new Error('工作区不存在或已被移除')
  const worktree = ctx.get('worktree')
  if (worktree === undefined || typeof worktree.create !== 'function') {
    throw new Error('永久工作树后端未启用，请先启用 dsh-worktree')
  }

  const result = await worktree.create({
    name,
    ...(baseCommit === '' ? {} : { baseCommit }),
    cwd: workspace.path,
    createdBy: null,
  })
  let registered = false
  let registrationWarning
  try {
    await ctx.workspaceRegistry.create(result.worktree.path, `[worktree] ${result.worktree.name}`)
    registered = true
  } catch (error) {
    registrationWarning = String(error?.message ?? error)
  }
  return {
    ok: true,
    name: result.worktree.name,
    path: result.worktree.path,
    repoRoot: result.repoRoot,
    baseCommit: result.worktree.baseCommit,
    registered,
    ...(registrationWarning ? { registrationWarning } : {}),
  }
}

export function apply(ctx) {
  ctx.webServer.register({
    kind: 'prefix',
    path: ENDPOINT,
    handler: async (req, res) => {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname
      if (path !== ENDPOINT) {
        sendJson(res, 404, { ok: false, error: '接口不存在' })
        return
      }
      if (req.method !== 'POST') {
        res.setHeader('allow', 'POST')
        sendJson(res, 405, { ok: false, error: '只允许 POST' })
        return
      }
      try {
        const input = await readJson(req)
        sendJson(res, 200, await createWorktree(ctx, input))
      } catch (error) {
        sendJson(res, 400, { ok: false, error: String(error?.message ?? error) })
      }
    },
  })
}

export { createWorktree }

