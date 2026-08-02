export type InstallSelection = {
  readonly kind: 'single'
  readonly id: string
}

export const singleInstallSelection = (id: string): InstallSelection => ({
  kind: 'single',
  id,
})
