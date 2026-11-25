import { readFileSync } from 'node:fs'
import { extname, join, relative, isAbsolute } from 'node:path'
import { collectTreasures } from './import-treasures.mjs'

const mime = { '.gif': 'image/gif', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }

export function treasurePreview() {
  return {
    name: 'elsewhere-treasure-preview',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root
      const incoming = join(root, '..', 'assets-incoming')
      let catalog
      let timer
      function changed(event, path) {
        const inside = relative(incoming, path)
        if (inside.startsWith('..') || isAbsolute(inside)) return
        catalog = undefined
        clearTimeout(timer)
        timer = setTimeout(() => server.ws.send({ type: 'custom', event: 'elsewhere:treasures-changed' }), 200)
      }
      server.watcher.add(incoming)
      server.watcher.on('all', changed)
      server.httpServer?.once('close', () => {
        clearTimeout(timer)
        server.watcher.off('all', changed)
      })
      server.middlewares.use('/web-treasures', (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        const file = (req.url || '').split('?')[0].slice(1)
        // Imported filenames are ASCII slugs. Only serve files discovered by the importer.
        try {
          // Re-read the on-disk base manifest on every manifest request (manual imports
          // may also take place while the dev server is running).
          if (!catalog || file === 'manifest.json') catalog = collectTreasures(root)
          if (file !== 'manifest.json' && !catalog.sources.has(file)) return next()
          const isManifest = file === 'manifest.json'
          const body = isManifest ? JSON.stringify(catalog.manifest) : readFileSync(catalog.sources.get(file))
          res.setHeader('Content-Type', isManifest ? 'application/json' : mime[extname(file)])
          res.setHeader('Cache-Control', 'no-store')
          res.end(req.method === 'HEAD' ? undefined : body)
        } catch (error) { next(error) }
      })
    },
  }
}
