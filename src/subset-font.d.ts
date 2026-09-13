declare module 'subset-font' {
  export interface SubsetFontOptions {
    targetFormat?: 'sfnt' | 'woff' | 'woff2' | 'truetype';
    preserveNameIds?: number[];
    keepFeatures?: string[];
    variationAxes?: Record<string, number | { min?: number; max?: number; default?: number }>;
    noLayoutClosure?: boolean;
    glyphNames?: boolean;
    noHinting?: boolean;
    dropTables?: string[];
  }

  export default function subsetFont(
    buffer: Buffer | Uint8Array,
    text: string,
    options?: SubsetFontOptions,
  ): Promise<Buffer>;
}
