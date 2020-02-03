import {promises as fs} from 'fs';
import {cmd, tmpFile, writeFile} from './util';

export type CompilerMacros = {
  [name: string]: string | number;
}

export const compileToWasm = async (code: string, {
  standard = 'c11',
  optimisationLevel = 2,
  allWarnings = true,
  extraWarnings = true,
  warningsAsErrors = true,
  macros = {},
}: {
  standard?: 'c89' | 'c99' | 'c11' | 'c17';
  optimisationLevel?: 0 | 1 | 2 | 3 | 'fast' | 's' | 'z' | 'g';
  allWarnings?: boolean;
  extraWarnings?: boolean;
  warningsAsErrors?: boolean;
  macros?: CompilerMacros;
}): Promise<Buffer> => {
  const {path: sourceCodePath, fd: sourceCodeFd} = await tmpFile('c');
  await writeFile(sourceCodeFd, code);

  const {path: outputWasmPath} = await tmpFile('wasm');

  await cmd(
    'clang',
    `-std=${standard}`,
    `-O${optimisationLevel}`,
    allWarnings ? '-Wall' : null,
    extraWarnings ? '-Wextra' : null,
    warningsAsErrors ? '-Werror' : null,
    '--target=wasm32-unknown-unknown-wasm',
    '-nostdlib', '-nostdinc', '-isystemstubs', '-Wl,--no-entry', '-Wl,--import-memory',
    ...Object.entries(macros).map(([name, code]) => `-D${name}=${code}`),
    sourceCodePath,
    '-o', outputWasmPath,
  );

  return fs.readFile(outputWasmPath);
};
