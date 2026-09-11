/** 按扩展名粗略判断能不能在下载页里直接预览。 */
export type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'none'

const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico']
const VIDEO = ['mp4', 'webm', 'mov', 'm4v', 'ogv']
const AUDIO = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac']

export function previewKind(filename: string): PreviewKind {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE.includes(ext)) return 'image'
  if (VIDEO.includes(ext)) return 'video'
  if (AUDIO.includes(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  return 'none'
}
