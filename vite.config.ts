import { defineConfig } from 'vite'
import { resolve } from 'path'
import { execSync } from 'child_process'

function getGitVersion() {
  try {
    const commitCount = execSync('git rev-list --count HEAD').toString().trim()
    const commitHash = execSync('git rev-parse --short HEAD').toString().trim()
    const commitDate = execSync('git log -1 --format=%cs').toString().trim()
    const dirty = execSync('git status --porcelain').toString().trim().length > 0
    const suffix = dirty ? '-dirty' : ''

    return {
      version: `1.0.${commitCount}${suffix}`,
      commitHash,
      commitDate,
      fullVersion: `1.0.${commitCount}-${commitHash}${suffix}`,
    }
  } catch {
    return {
      version: '1.0.0',
      commitHash: 'unknown',
      commitDate: new Date().toISOString().split('T')[0],
      fullVersion: '1.0.0-unknown',
    }
  }
}

const gitVersion = getGitVersion()

export default defineConfig({
  base: '/2d-star-system-map/',
  define: {
    __APP_VERSION__: JSON.stringify(gitVersion.version),
    __APP_COMMIT__: JSON.stringify(gitVersion.commitHash),
    __APP_DATE__: JSON.stringify(gitVersion.commitDate),
    __APP_FULL_VERSION__: JSON.stringify(gitVersion.fullVersion),
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        test: resolve(__dirname, 'test.html'),
      },
    },
  },
})
