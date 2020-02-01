import * as fs from 'fs';
import * as tmp from 'tmp';
import {execFile} from 'child_process';

export const arrayOf = <T> (len: number, map: (i: number) => T): T[] => Array(len).fill(void 0).map((_, i) => map(i));

export const uniq = <T> (vals: T[]): T[] => [...new Set(vals)];

export const mapSet = <T, R> (set: Set<T>, map: (v: T) => R): R[] => [...set].map(map);


export const tmpFile = () => new Promise<{ path: string, fd: number }>((resolve, reject) => {
  tmp.file((err, path, fd) => {
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

export const readFile = (fd: number) => new Promise<Buffer>((resolve, reject) => {
  fs.readFile(fd, (err, data) => {
    if (err) {
      return reject(err);
    }
    resolve(data);
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
