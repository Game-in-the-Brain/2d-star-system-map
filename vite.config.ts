import { defineConfig } from 'vite'
import { resolve } from 'path'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { VitePWA } from 'vite-plugin-pwa'

function getVersionInfo() {
  let baseVersion = '1.00'
  try {
    baseVersion = readFileSync('./VERSION', 'utf-8').trim()
  } catch {
    // fallback to default
  }

  try {
    const commitHash = execSync('git rev-parse --short HEAD').toString().trim()
    const commitDate = execSync('git log -1 --format=%cs').toString().trim()
    const dirty = execSync('git status --porcelain').toString().trim().length > 0
    const suffix = dirty ? '-dirty' : ''

    return {
      version: baseVersion + suffix,
      commitHash,
      commitDate,
      fullVersion: `${baseVersion}-${commitHash}${suffix}`,
    }
  } catch {
    return {
      version: baseVersion,
      commitHash: 'unknown',
      commitDate: new Date().toISOString().split('T')[0],
      fullVersion: `${baseVersion}-unknown`,
    }
  }
}

const versionInfo = getVersionInfo()

export default defineConfig({
  base: '/2d-star-system-map/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: 'Mneme System Map',
        short_name: 'Mneme Map',
        description: 'Interactive 2D star system map for the Mneme world generator.',
        theme_color: '#03050a',
        background_color: '#03050a',
        display: 'standalone',
        orientation: 'any',
        scope: '/2d-star-system-map/',
        start_url: '/2d-star-system-map/',
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(versionInfo.version),
    __APP_COMMIT__: JSON.stringify(versionInfo.commitHash),
    __APP_DATE__: JSON.stringify(versionInfo.commitDate),
    __APP_FULL_VERSION__: JSON.stringify(versionInfo.fullVersion),
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
