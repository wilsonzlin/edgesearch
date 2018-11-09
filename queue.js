"use strict";

module.exports = class Queue {
  constructor(concurrency) {
    this._queue = [];
    this.active = 0;
    this.concurrency = concurrency;
  }

  async _process() {
    if (this.active >= this.concurrency || !this._queue.length) {
      return;
    }

    this.active++;
    const { resolve, reject, task } = this._queue.shift();

    let result;
    let error = null;
    try {
      result = await task();
    } catch (e) {
      error = e;
    }

    try {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    } finally {
      this.active--;
      this._process();
    }
  }

  queue(task) {
    return new Promise((resolve, reject) => {
      this._queue.push({ resolve, reject, task });
      this._process();
    });
  }
};
