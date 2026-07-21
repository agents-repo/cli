export class RegistryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RegistryError'
  }
}

export class RegistryFetchError extends RegistryError {
  readonly statusCode?: number

  constructor(message: string, statusCode?: number) {
    super(message)
    this.name = 'RegistryFetchError'
    this.statusCode = statusCode
  }
}

export class RegistryCatalogValidationError extends RegistryError {
  constructor(message: string) {
    super(message)
    this.name = 'RegistryCatalogValidationError'
  }
}

export class RegistryRefResolutionError extends RegistryError {
  constructor(message: string) {
    super(message)
    this.name = 'RegistryRefResolutionError'
  }
}

export class IndexSchemaError extends RegistryError {
  readonly schemaVersion: string

  constructor(message: string, schemaVersion: string) {
    super(message)
    this.name = 'IndexSchemaError'
    this.schemaVersion = schemaVersion
  }
}

export class ManifestSchemaError extends RegistryError {
  readonly schemaVersion?: string

  constructor(message: string, schemaVersion?: string) {
    super(message)
    this.name = 'ManifestSchemaError'
    this.schemaVersion = schemaVersion
  }
}

export class PackageNotFoundError extends RegistryError {
  readonly packageId: string

  constructor(packageId: string) {
    super(`Package not found in registry index: ${packageId}`)
    this.name = 'PackageNotFoundError'
    this.packageId = packageId
  }
}

export class PackageYankedError extends RegistryError {
  readonly packageId: string

  constructor(packageId: string) {
    super(`Package is yanked and cannot be installed: ${packageId}`)
    this.name = 'PackageYankedError'
    this.packageId = packageId
  }
}

export class ManifestVersionNotFoundError extends RegistryError {
  readonly version: string
  readonly packageId?: string

  constructor(version: string, packageId?: string) {
    super(
      packageId
        ? `Version ${version} not found in manifest for ${packageId}`
        : `Version ${version} not found in manifest`,
    )
    this.name = 'ManifestVersionNotFoundError'
    this.version = version
    this.packageId = packageId
  }
}

export class ManifestArtifactNotFoundError extends RegistryError {
  readonly targetId: string
  readonly version: string

  constructor(targetId: string, version: string) {
    super(`No artifact for install target "${targetId}" in manifest version ${version}`)
    this.name = 'ManifestArtifactNotFoundError'
    this.targetId = targetId
    this.version = version
  }
}
