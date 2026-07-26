import { InstallPersistence } from './installPersistence.js'
import { planPackageInstall } from './installPackagePlan.js'
import { resolveInstallContext } from './resolveInstallContext.js'
import { resolveLockRef } from './resolveLockRef.js'
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
  private readonly installPersistence = new InstallPersistence()

  async run(options: InstallServiceOptions): Promise<InstallResult> {
    const context = await resolveInstallContext({
      cwd: options.cwd,
      env: options.env,
      targetOverride: options.target,
      globalFlag: options.global,
      yes: options.yes,
    })

    const warnings = [...context.warnings]
    const { target, scope, catalogResult, resolved } = context

    const plan = await planPackageInstall({
      catalogResult,
      resolved,
      packageId: options.packageId,
      target,
      warnings,
    })

    const adHocInstall = !Object.hasOwn(resolved.packages, plan.pkg.id)
    const noSave = options.noSave === true

    const resultBase: InstallResult = {
      packageId: plan.pkg.id,
      version: plan.version,
      target,
      extractRoot: scope.extractRoot,
      artifactUrl: plan.artifactUrl,
      saved: false,
      dryRun: options.dryRun ?? false,
      global: scope.global,
      noSave,
      warnings,
    }

    if (options.dryRun === true) {
      return resultBase
    }

    const zipBytes = await downloadArtifact(plan.artifactUrl)
    verifySha256(zipBytes, plan.artifact.sha256)
    const extractedPaths = await extractPackageArtifact(
      zipBytes,
      target,
      plan.version,
      scope.extractRoot,
    )

    if (!noSave && scope.mutateProjectConfig) {
      try {
        const resolvedRef = resolveLockRef(resolved, catalogResult)
        await this.installPersistence.save({
          resolved: { ...resolved, target },
          packageId: plan.pkg.id,
          version: plan.version,
          target,
          artifact: plan.artifact,
          resolvedRef,
          adHocInstall,
        })
      } catch (error) {
        await rollbackExtractedPaths(extractedPaths)
        throw error
      }

      return {
        ...resultBase,
        saved: true,
      }
    }

    if (!noSave && scope.global) {
      try {
        const resolvedRef = resolveLockRef(resolved, catalogResult)
        await this.installPersistence.saveGlobal({
          env: options.env,
          packageId: plan.pkg.id,
          version: plan.version,
          target,
          artifact: plan.artifact,
          resolvedRef,
        })
      } catch (error) {
        await rollbackExtractedPaths(extractedPaths)
        throw error
      }

      return {
        ...resultBase,
        saved: true,
      }
    }

    return {
      ...resultBase,
      saved: false,
    }
  }
}
