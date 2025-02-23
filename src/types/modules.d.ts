declare module 'pdf-parse' {
  interface PDFData {
    text: string;
    numpages: number;
    info: any;
    metadata: any;
    version: string;
  }

  const pdf: (dataBuffer: Buffer) => Promise<PDFData>;
  export default pdf;
}

declare module 'mammoth' {
  interface ExtractResult {
    value: string;
    messages: any[];
  }

  interface Options {
    path?: string;
    buffer?: Buffer;
  }

  export function extractRawText(options: Options): Promise<ExtractResult>;
}

declare module 'textract' {
  interface TextractOptions {
    preserveLineBreaks?: boolean;
    preserveOnlyMultipleLineBreaks?: boolean;
    includeAltText?: boolean;
  }

  function fromFileWithPath(
    filePath: string,
    callback: (error: Error | null, text: string) => void
  ): void;

  function fromBufferWithMime(
    mimeType: string,
    buffer: Buffer,
    options: TextractOptions | undefined,
    callback: (error: Error | null, text: string) => void
  ): void;

  function fromBufferWithMime(
    mimeType: string,
    buffer: Buffer,
    callback: (error: Error | null, text: string) => void
  ): void;

  export { fromFileWithPath, fromBufferWithMime };
} 