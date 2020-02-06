import {promises as fs} from 'fs';
import * as path from 'path';
import {join} from 'path';

const RESOURCES = path.join(__dirname, 'resources');

export const getRunner = async (name: string): Promise<string> => fs.readFile(join(RESOURCES, `runner.${name}.c`), 'utf8');

export const getWorker = async (name: string): Promise<string> => fs.readFile(join(RESOURCES, `worker.${name}.js`), 'utf8');
