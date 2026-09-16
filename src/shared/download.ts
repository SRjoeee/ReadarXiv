// Hand the reader a file from an extension page (shared: the providers' prompt export and the settings page's diagnostics export both use it): `<a download>` works there as it is, no file-saver needed
export function downloadTextFile(name: string, text: string, type: string, doc: Document = document): void {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = doc.createElement('a')
  a.href = url
  a.download = name
  doc.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
