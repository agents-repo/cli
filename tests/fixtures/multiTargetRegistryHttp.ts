import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';

import type { PackageManifest } from '../../src/modules/registry/domain/manifest.js';
import {
  buildCursorSkillZip,
  buildGithubCopilotZip,
  makeInstallTestCatalog,
  makeMultiTargetInstallTestManifest,
  makeMultiTargetInstallTestMetadata,
} from './installFixtures.js';

export interface MultiTargetMockRegistry {
  readonly server: Server;
  readonly baseUrl: string;
}

export const startMultiTargetMockRegistry = async (): Promise<MultiTargetMockRegistry> => {
  const cursorZipBytes = buildCursorSkillZip();
  const copilotZipBytes = buildGithubCopilotZip();
  const cursorSha256 = createHash('sha256').update(cursorZipBytes).digest('hex');
  const copilotSha256 = createHash('sha256').update(copilotZipBytes).digest('hex');

  const baseManifest = makeMultiTargetInstallTestManifest();
  const manifest: PackageManifest = {
    ...baseManifest,
    versions: [
      {
        ...baseManifest.versions[0],
        artifacts: [
          {
            target: 'cursor',
            file: '1.0.0-cursor.zip',
            sha256: cursorSha256,
          },
          {
            target: 'github-copilot',
            file: '1.0.0-github-copilot.zip',
            sha256: copilotSha256,
          },
        ],
      },
    ],
  };

  const catalog = makeInstallTestCatalog();
  const multiTargetCatalog = {
    ...catalog,
    packages: [
      {
        ...catalog.packages[0],
        installTargets: [
          { id: 'cursor', status: 'supported' as const },
          { id: 'github-copilot', status: 'supported' as const },
        ],
      },
    ],
  };

  const server = createServer((request, response) => {
    const url = request.url ?? '/';

    if (url.includes('/packages/index.json')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(multiTargetCatalog));
      return;
    }

    if (url.includes('/agents-repo/sample-agent/versions/manifest.json')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(manifest));
      return;
    }

    if (url.includes('/agents-repo/sample-agent/') && url.includes('/metadata.json')) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(makeMultiTargetInstallTestMetadata()));
      return;
    }

    if (url.includes('1.0.0-cursor.zip')) {
      response.writeHead(200);
      response.end(cursorZipBytes);
      return;
    }

    if (url.includes('1.0.0-github-copilot.zip')) {
      response.writeHead(200);
      response.end(copilotZipBytes);
      return;
    }

    response.writeHead(404);
    response.end('not found');
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Failed to bind multi-target mock registry server');
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/?ref=v2.0.0`,
  };
};

export const stopMockRegistryServer = async (server: Server): Promise<void> => {
  server.closeAllConnections?.();

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};

export const MULTI_TARGET_VERBOSE_SUMMARY =
  'Installed agents-repo/sample-agent@1.0.0 to 2 targets: cursor, github-copilot';

export const MULTI_TARGET_VERBOSE_UPDATE_SUMMARY =
  'Updated agents-repo/sample-agent@1.0.0 to 2 targets: cursor, github-copilot';
