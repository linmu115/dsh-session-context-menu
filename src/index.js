import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

export const name = 'dsh-session-context-menu'

const REMOTE_PACKAGE = 'dsh-session-context-menu'

const looseCodec = () => ({
  mode: 'strict',
  typeSymbol: 'dsh-session-context-menu/json',
  schema: { parse: value => value },
})

function descriptor(method, parameters) {
  return {
    id: `${REMOTE_PACKAGE}#sessionContextMenu/${method}`,
    service: 'sessionContextMenu',
    namespace: 'sessionContextMenu',
    method,
    invocation: { kind: 'direct' },
    parameters: parameters.map(name => ({ name, wire: name, source: 'json', codec: looseCodec() })),
    result: looseCodec(),
  }
}

const REMOTE_INVOCATIONS = [descriptor('createWorktree', ['workspaceId', 'name', 'baseCommit'])]

/** Host-side bridge for the workspace menu's permanent-worktree action. */
class SessionContextMenuGateway extends TypertRemoteService {
  static inject = ['workspaceRegistry', 'typert']

  constructor(ctx) {
    super(ctx, 'sessionContextMenu')
    this.context = ctx
    const remote = Remote('createWorktree')
    remote(SessionContextMenuGateway.prototype.createWorktree, {
      name: 'createWorktree',
      private: false,
      static: false,
      addInitializer: initializer => initializer.call(this),
    })
    if (ctx.typert && typeof ctx.typert.register === 'function') {
      try {
        const dispose = ctx.typert.register({
          package: REMOTE_PACKAGE,
          face: 'host',
          model: 'src',
          schemas: [],
          invocations: REMOTE_INVOCATIONS,
        })
        ctx.on('dispose', () => { try { dispose() } catch {} })
      } catch (error) {
        ctx.logger?.warn?.(`dsh-session-context-menu: remote registration failed: ${String(error?.message ?? error)}`)
      }
    }
  }

  async createWorktree(workspaceId, name, baseCommit) {
    const workspace = this.context.workspaceRegistry.get(String(workspaceId))
    if (workspace === undefined) return { ok: false, error: '工作区不存在或已被移除' }
    const worktree = this.context.get('worktree')
    if (worktree === undefined || typeof worktree.create !== 'function') {
      return { ok: false, error: '永久工作树后端未启用，请先启用 dsh-worktree' }
    }
    try {
      const result = await worktree.create({
        name: String(name ?? '').trim(),
        baseCommit: typeof baseCommit === 'string' && baseCommit.trim() !== '' ? baseCommit.trim() : undefined,
        cwd: workspace.path,
        createdBy: null,
      })
      let registered = false
      try {
        await this.context.workspaceRegistry.create(result.worktree.path, `[worktree] ${result.worktree.name}`)
        registered = true
      } catch (error) {
        result.registrationWarning = String(error?.message ?? error)
      }
      return {
        ok: true,
        name: result.worktree.name,
        path: result.worktree.path,
        repoRoot: result.repoRoot,
        baseCommit: result.worktree.baseCommit,
        registered,
        ...(result.registrationWarning ? { registrationWarning: result.registrationWarning } : {}),
      }
    } catch (error) {
      return { ok: false, error: String(error?.message ?? error) }
    }
  }
}

export const inject = ['workspaceRegistry', 'typert']

export function apply(ctx) {
  if (ctx.get('workspaceRegistry') !== undefined && ctx.get('typert') !== undefined) {
    ctx.plugin(SessionContextMenuGateway)
  }
}

export { SessionContextMenuGateway }
