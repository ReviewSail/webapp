import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))

function git(cmd: string, fallback: string): string {
  try {
    return execSync(cmd).toString().trim()
  } catch {
    return fallback
  }
}

// On Vercel the git dir isn't always available, so prefer the env vars it injects.
const fullSha = process.env.VERCEL_GIT_COMMIT_SHA || git('git rev-parse HEAD', 'unknown')
const branch =
  process.env.VERCEL_GIT_COMMIT_REF || git('git rev-parse --abbrev-ref HEAD', 'unknown')

// Wall-clock time this build actually ran, i.e. when Vercel built the deploy —
// distinct from the commit's own timestamp, which can lag behind a push/merge.
const buildTime = new Date().toISOString()
const commitTime = git('git log -1 --format=%cI', buildTime)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_SHA__: JSON.stringify(fullSha),
    __BUILD_BRANCH__: JSON.stringify(branch),
    __BUILD_TIME__: JSON.stringify(buildTime),
    __COMMIT_TIME__: JSON.stringify(commitTime),
  },
})
