// pdfjs-dist ships the viewer components' types beside the library's, not beside web/pdf_viewer.mjs
declare module 'pdfjs-dist/web/pdf_viewer.mjs' {
  export * from 'pdfjs-dist/types/web/pdf_viewer.component'
}
