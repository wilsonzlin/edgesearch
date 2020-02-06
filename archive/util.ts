import * as tmp from 'tmp';
import {execFile} from 'child_process';

export const arrayOf = <T> (len: number, map: (i: number) => T): T[] => Array(len).fill(void 0).map((_, i) => map(i));

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
