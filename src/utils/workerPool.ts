import type { GPXData } from './gpxParser';
import { deserializeGPXData } from './gpxParser';
import type { ParseRequest, WorkerResponse } from '../workers/parseWorker';

export class WorkerPool {
  private workers: Worker[];
  private nextWorker = 0;
  private nextId = 0;
  private pending = new Map<string, { resolve: (data: GPXData) => void; reject: (err: Error) => void }>();

  constructor(size = navigator.hardwareConcurrency || 4) {
    this.workers = Array.from({ length: size }, () => {
      const w = new Worker(new URL('../workers/parseWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.type === 'result') {
          p.resolve(deserializeGPXData(msg.data));
        } else {
          p.reject(new Error(msg.message));
        }
      };
      return w;
    });
  }

  parse(content: string, format: 'gpx' = 'gpx'): Promise<GPXData> {
    const id = String(++this.nextId);
    const worker = this.workers[this.nextWorker % this.workers.length];
    this.nextWorker++;

    return new Promise<GPXData>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ type: 'parse', id, content, format } satisfies ParseRequest);
    });
  }

  terminate() {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    for (const [, p] of this.pending) p.reject(new Error('Pool terminated'));
    this.pending.clear();
  }
}
