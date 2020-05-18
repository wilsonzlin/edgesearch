export class Queue {
  private readonly _queue: {
    resolve: (r: any) => void;
    reject: (error: unknown) => void;
    task: any;
  }[] = [];
  private active: number = 0;

  constructor (
    private readonly concurrency: number,
  ) {
  }

  private async _process () {
    if (this.active >= this.concurrency || !this._queue.length) {
      return;
    }

    this.active++;
    const {resolve, reject, task} = this._queue.shift()!;

    try {
      resolve(await task());
    } catch (e) {
      reject(e);
    } finally {
      this.active--;
      this._process();
    }
  }

  public queue <R>(task: () => Promise<R>): Promise<R> {
    return new Promise((resolve, reject) => {
      this._queue.push({resolve, reject, task});
      this._process();
    });
  }
}
