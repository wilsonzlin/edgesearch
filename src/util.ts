import * as fs from 'fs';
import * as tmp from 'tmp';
import {execFile} from 'child_process';
import Long from 'long';

export const arrayOf = <T> (len: number, map: (i: number) => T): T[] => Array(len).fill(void 0).map((_, i) => map(i));

export const uniq = <T> (vals: Iterable<T>): T[] => [...new Set(vals)];

export const mapSet = <T, R> (set: Set<T>, fn: (v: T) => R): R[] => [...set].map(fn);

export const mapMapValues = <K, T, R> (map: Map<K, T>, fn: (v: T, k: K) => R): Map<K, R> => new Map([...map.entries()].map(([key, value]) => [key, fn(value, key)]));

export const mapMap = <K, T, R> (map: Map<K, T>, fn: (v: T, k: K) => R): R[] => [...map.entries()].map(([key, value]) => fn(value, key));

export const extendSet = <T> (target: Set<T>, extension: Set<T>): Set<T> => {
  for (const v of extension) {
    target.add(v);
  }
  return target;
};

export const extendArray = <T> (target: T[], extension: ReadonlyArray<T>): T[] => {
  for (const v of extension) {
    target.push(v);
  }
  return target;
};

export const transpose = <T> (matrix: ReadonlyArray<ReadonlyArray<T>>): T[][] => {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const transposed = arrayOf(cols, () => Array(rows));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      transposed[c][r] = matrix[r][c];
    }
  }

  return transposed;
};

export const uint64CArrayInitialiser = (vals: Long[]): string => `{${vals.map(e => `${e.toString()}llu`).join(',')}}`;

export const tmpFile = (ext: string) => new Promise<{ path: string, fd: number }>((resolve, reject) => {
  tmp.file({
    postfix: `.${ext}`,
  }, (err, path, fd) => {
    if (err) {
      return reject(err);
    }
    resolve({path, fd});
  });
});

export const writeFile = (fd: number, contents: string | Buffer) => new Promise<void>((resolve, reject) => {
  fs.writeFile(fd, contents, err => {
    if (err) {
      return reject(err);
    }
    resolve();
  });
});

export const cmd = async (command: string, ...args: (string | number | null | undefined)[]): Promise<string> =>
  new Promise((resolve, reject) =>
    execFile(command, args.filter(a => a != null).map(String), (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else if (stderr) {
        reject(new Error(`stderr: ${stderr}`));
      } else {
        resolve(stdout);
      }
    }));
