import { preview } from 'vite'

/** Sert le build (`dist/`) le temps d'un test. */
export async function serveBuild() {
  const server = await preview({ preview: { port: 0, strictPort: false }, logLevel: 'silent' })
  const url = server.resolvedUrls?.local[0]
  if (!url) throw new Error('Serveur de prévisualisation sans adresse')
  return { url, close: () => server.close() }
}
