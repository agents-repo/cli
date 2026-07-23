import { ConfigResolver } from '../../config/application/configResolver.js'
import { ConfigValidationError } from '../../config/domain/configErrors.js'
import { isValidInstallTargetId } from '../../config/domain/validators.js'
import {
  buildManifestArtifactUrl,
  findManifestArtifact,
} from '../../registry/application/resolveArtifact.js'
import { evaluatePackageStatusPolicy } from '../../registry/application/packageStatusPolicy.js'
import { resolvePackageInCatalog } from '../../registry/application/resolvePackageInCatalog.js'
import {
  loadPackageManifest,
  loadPackageMetadata,
  loadRegistryCatalog,
} from '../../registry/infrastructure/registryRepository.js'
import { resolveInstallVersion } from './resolveInstallVersion.js'
import { resolveInstallScope } from './installScope.js'
import { assertInstallTargetSupported } from './validateInstallTarget.js'
import { resolveLockRef } from './resolveLockRef.js'
import { InstallPersistence } from './installPersistence.js'
import { downloadArtifact } from '../infrastructure/artifactDownloader.js'
import { verifySha256 } from '../infrastructure/sha256Verifier.js'
import {
  extractPackageArtifact,
  rollbackExtractedPaths,
} from '../infrastructure/packageExtractor.js'
import type { InstallResult } from '../domain/installResult.js'

export interface InstallServiceOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly packageId: string
  readonly target?: string
  readonly global?: boolean
  readonly yes?: boolean
  readonly dryRun?: boolean
  readonly noSave?: boolean
}

export class InstallService {
  private readonly configResolver = new ConfigResolver()
  private readonly installPersistence = new InstallPersistence()

  async run(options: InstallServiceOptions): Promise<InstallResult> {
    const cwd = options.cwd ?? process.cwd()
    const env = options.env ?? process.env
    const warnings: string[] = []

    const resolved = await this.configResolver.resolve({
      cwd,
      env,
      waiveConflicts: options.yes ?? false,
    })

    warnings.push(...resolved.warnings.map((warning) => warning.message))

    const effectiveTargetInput = options.target ?? resolved.target
    if (effectiveTargetInput === undefined) {
      throw new ConfigValidationError('Install target is required but missing from config', 'missing_target')
    }

    if (!isValidInstallTargetId(effectiveTargetInput)) {
      throw new ConfigValidationError(
        `Invalid install target id: ${effectiveTargetInput}`,
        'invalid_enum',
      )
    }

    const target = effectiveTargetInput
    const scope = resolveInstallScope({
      cwd,
      env,
      globalFlag: options.global,
      configGlobal: resolved.global,
    })

    const catalogResult = await loadRegistryCatalog(resolved.registry)
    warnings.push(...catalogResult.warnings)

    const pkg = resolvePackageInCatalog(catalogResult.catalog, options.packageId)
    const statusPolicy = evaluatePackageStatusPolicy(pkg.status, pkg.id)
    warnings.push(...statusPolicy.warnings)

    const manifest = await loadPackageManifest(
      catalogResult.registryBaseUrl,
      pkg.namespace,
      pkg.package,
    )

    const existingRange = resolved.packages[pkg.id]
    const adHocInstall = !Object.hasOwn(resolved.packages, pkg.id)
    const version = resolveInstallVersion(manifest, pkg.id, existingRange)

    const metadata = await loadPackageMetadata(
      catalogResult.registryBaseUrl,
      pkg.namespace,
      pkg.package,
      version,
    )

    assertInstallTargetSupported(pkg, metadata, manifest, version, target)

    const artifact = findManifestArtifact(manifest, version, target)
    const artifactUrl = buildManifestArtifactUrl(
      catalogResult.registryBaseUrl,
      pkg.namespace,
      pkg.package,
      version,
      artifact.file,
    )

    const noSave = options.noSave === true

    const resultBase: InstallResult = {
      packageId: pkg.id,
      version,
      target,
      extractRoot: scope.extractRoot,
      artifactUrl,
      saved: false,
      dryRun: options.dryRun ?? false,
      global: scope.global,
      noSave,
      warnings,
    }

    if (options.dryRun === true) {
      return resultBase
    }

    const zipBytes = await downloadArtifact(artifactUrl)
    verifySha256(zipBytes, artifact.sha256)
    const extractedPaths = await extractPackageArtifact(zipBytes, target, version, scope.extractRoot)

    if (!noSave && scope.mutateProjectConfig) {
      try {
        const resolvedRef = resolveLockRef(resolved, catalogResult)
        await this.installPersistence.save({
          resolved: { ...resolved, target },
          packageId: pkg.id,
          version,
          target,
          artifact,
          resolvedRef,
          adHocInstall,
        })
      } catch (error) {
        await rollbackExtractedPaths(extractedPaths)
        throw error
      }
    }

    return {
      ...resultBase,
      saved: !noSave && scope.mutateProjectConfig,
    }
  }
}
