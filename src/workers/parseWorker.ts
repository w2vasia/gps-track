import { parseGPXFallback, serializeGPXData } from '../utils/gpxParser';

export interface ParseRequest {
  type: 'parse';
  id: string;
  content: string;
  format: 'gpx';
}

export interface ParseResult {
  type: 'result';
  id: string;
  data: ReturnType<typeof serializeGPXData>;
}

export interface ParseError {
  type: 'error';
  id: string;
  message: string;
}

export type WorkerResponse = ParseResult | ParseError;

self.onmessage = async (e: MessageEvent<ParseRequest>) => {
  const { id, content } = e.data;
  try {
    const data = parseGPXFallback(content);
    self.postMessage({ type: 'result', id, data: serializeGPXData(data) } satisfies ParseResult);
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err instanceof Error ? err.message : 'Parse failed' } satisfies ParseError);
  }
};
