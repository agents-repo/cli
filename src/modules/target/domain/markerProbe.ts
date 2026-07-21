export interface TargetMarkerProbe {
  isDirectory(absolutePath: string): Promise<boolean>
  isFile(absolutePath: string): Promise<boolean>
}
