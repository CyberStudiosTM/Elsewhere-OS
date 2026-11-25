// The keys-only glob lists the bundled PNGs without importing or copying them.
const publicPrefix = '/public/studio-stickers/'
const paths = Object.keys(import.meta.glob('/public/studio-stickers/*/*.[pP][nN][gG]'))

export const studioStickers = new Map(paths.map(path => {
  const id = path.slice(publicPrefix.length)
  const [pack, filename] = id.split('/')
  const name = filename.replace(/\.png$/i, '').replace(/[-_]/g, ' ')
  const url = '/studio-stickers/' + id.split('/').map(encodeURIComponent).join('/')
  return [id, { id, pack, name, url }] as const
}))
