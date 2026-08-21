import assert from 'node:assert/strict'
import test from 'node:test'

import { createWorktree } from '../src/index.js'

test('createWorktree uses the selected workspace path and registers the durable checkout', async () => {
  const calls = []
  const ctx = {
    workspaceRegistry: {
      get(id) {
        assert.equal(id, 'workspace-1')
        return { path: 'D:/repo' }
      },
      async create(path, title) {
        calls.push(['register', path, title])
      },
    },
    get(name) {
      assert.equal(name, 'worktree')
      return {
        async create(input) {
          calls.push(['create', input])
          return {
            repoRoot: 'D:/repo',
            worktree: {
              name: input.name,
              path: 'D:/repo/.dsh-worktrees/feature',
              baseCommit: 'abc123',
            },
          }
        },
      }
    },
  }

  const result = await createWorktree(ctx, {
    workspaceId: 'workspace-1',
    name: 'feature',
    baseCommit: 'HEAD',
  })

  assert.equal(result.ok, true)
  assert.equal(result.registered, true)
  assert.deepEqual(calls, [
    ['create', { name: 'feature', baseCommit: 'HEAD', cwd: 'D:/repo', createdBy: null }],
    ['register', 'D:/repo/.dsh-worktrees/feature', '[worktree] feature'],
  ])
})

