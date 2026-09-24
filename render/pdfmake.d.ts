// pdfmake ships no types for its prebuilt bundle or its font module; render/pdf.ts
// is the only module that touches them, and it uses no more than this.
declare module 'pdfmake/build/pdfmake.js' {
  const pdfMake: {
    addVirtualFileSystem(vfs: Record<string, string>): void;
    setUrlAccessPolicy(policy: (url: string) => boolean): void;
    localAccessPolicy?: (path: string) => boolean;
    createPdf(definition: Record<string, unknown>): { getBuffer(): Promise<Uint8Array> };
  };
  export default pdfMake;
}

declare module 'pdfmake/build/vfs_fonts.js' {
  const vfs: Record<string, string>;
  export default vfs;
}
