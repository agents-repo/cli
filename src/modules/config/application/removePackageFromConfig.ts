import type { ResolvedAgentsConfig } from '../../config/domain/agentsConfig.js'
import { AgentsJsonRepository } from '../infrastructure/agentsJsonRepository.js'
import type { AgentsConfigDocument } from '../domain/agentsConfig.js'
import { AGENTS_REPO_NAMESPACE } from '../domain/configConstants.js'
import { isPlainObject } from '../infrastructure/jsonDocument.js'

export class RemovePackageFromConfig {
  private readonly agentsJsonRepository = new AgentsJsonRepository()

  async remove(resolved: ResolvedAgentsConfig, packageId: string): Promise<void> {
    const document = this.removePackageFromDocument(resolved.rawDocument, resolved.gateMode, packageId)
    await this.agentsJsonRepository.write(resolved.configPath, document)
  }

  private removePackageFromDocument(
    existing: AgentsConfigDocument | null,
    gateMode: ResolvedAgentsConfig['gateMode'],
    packageId: string,
  ): AgentsConfigDocument {
    if (existing === null) {
      throw new Error('Cannot remove package when agents.json is missing')
    }

    const document: AgentsConfigDocument = { ...existing }

    if (gateMode === 'namespace') {
      const namespaceBlock = document[AGENTS_REPO_NAMESPACE]
      if (!isPlainObject(namespaceBlock)) {
        return document
      }

      const namespaceCopy = { ...namespaceBlock }
      if (!isPlainObject(namespaceCopy.packages)) {
        return document
      }

      const packages = { ...namespaceCopy.packages }
      delete packages[packageId]
      namespaceCopy.packages = packages
      document[AGENTS_REPO_NAMESPACE] = namespaceCopy
      return document
    }

    const packages = isPlainObject(document.packages) ? { ...document.packages } : {}
    delete packages[packageId]
    document.packages = packages
    return document
  }
}
