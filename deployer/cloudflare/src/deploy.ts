import {promises as fs} from 'fs';
import {join} from 'path';
import {CFAuth, publishWorker, uploadKv} from './cf';

type UploadState = {
  nextDocumentsChunk: number;
  nextTermsChunk: number;
};

class UploadStateManager {
  constructor (
    private readonly path: string,
    private readonly state: UploadState = {
      nextDocumentsChunk: 0,
      nextTermsChunk: 0,
    },
  ) {
  }

  static async forOutputDir (outputDir: string) {
    const file = join(outputDir, 'upload-state.tmp');
    let initialState;
    try {
      initialState = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
      // Ignore.
    }
    return new UploadStateManager(file, initialState);
  }

  private async writeState () {
    await fs.writeFile(this.path, JSON.stringify(this.state));
  }

  async incrementDocumentsChunk () {
    this.state.nextDocumentsChunk++;
    await this.writeState();
  }

  getNextDocumentsChunk () {
    return this.state.nextDocumentsChunk;
  }

  async incrementTermsChunk () {
    this.state.nextTermsChunk++;
    await this.writeState();
  }

  getNextTermsChunk () {
    return this.state.nextTermsChunk;
  }

  async delete () {
    await fs.unlink(this.path);
  }
}

const listDirChunks = async (dir: string): Promise<number[]> =>
  (await fs.readdir(dir))
    .map(e => Number.parseInt(e, 10))
    .sort((a, b) => a - b);

export const deploy = async ({
  accountEmail,
  accountId,
  globalApiKey,
  kvNamespaceId,
  name,
  outputDir,
  uploadData,
}: {
  accountEmail: string;
  accountId: string;
  globalApiKey: string;
  kvNamespaceId: string;
  name: string;
  outputDir: string;
  uploadData: boolean;
}) => {
  const auth: CFAuth = {accountEmail, accountId, globalApiKey};

  console.log('Uploading worker...');
  const [script, wasm] = await Promise.all(
    ['worker.js', 'runner.wasm'].map(f => fs.readFile(join(outputDir, f))),
  );

  await publishWorker({auth, name, kvNamespaceId, script, wasm});
  console.log('Worker uploaded');

  if (!uploadData) {
    console.log(`Not uploading data`);
    return;
  }

  const uploadState = await UploadStateManager.forOutputDir(outputDir);

  for (const chunkId of await listDirChunks(join(outputDir, 'documents'))) {
    if (chunkId < uploadState.getNextDocumentsChunk()) {
      continue;
    }
    console.log(`Uploading documents chunk ${chunkId}...`);
    await uploadKv({
      auth,
      key: `doc_${chunkId}`,
      namespaceId: kvNamespaceId,
      value: await fs.readFile(join(outputDir, 'documents', `${chunkId}`)),
    });
    await uploadState.incrementDocumentsChunk();
  }

  for (const chunkId of await listDirChunks(join(outputDir, 'terms'))) {
    if (chunkId < uploadState.getNextTermsChunk()) {
      continue;
    }
    console.log(`Uploading terms chunk ${chunkId}...`);
    await uploadKv({
      auth,
      key: `terms_${chunkId}`,
      namespaceId: kvNamespaceId,
      value: await fs.readFile(join(outputDir, 'terms', `${chunkId}`)),
    });
    await uploadState.incrementTermsChunk();
  }

  await uploadState.delete();
  console.log(`Data successfully uploaded`);
};
