interface WuCaiAuthResponse {
  accessToken: string
}

interface WuCaiExportLastCursor {
  lastId: number
  lastHighlightPKID: number
  lastTime: number
}

interface WuCaiExportConfig {
  titleFormat: number
  writeStyle: number
  titleStyle: number
  highlightStyle: number
  annotationStyle: number
  tagStyle: number
  haveWuCaiTag: number
  template: string
}

// 初始化接口返回的字段
interface ExportInitRequestResponse {
  lastCursor: WuCaiExportLastCursor
  exportConfig: WuCaiExportConfig
  totalNotes: number
  notesExported: number
  taskStatus: string
}

interface WuCaiHolders {
  title: string
  url: string
  wucaiurl: string
  tags: string
  pagenote: string
  highlights: string
  createat: string
  updateat: string
}

interface HighlightInfo {
  note: string
  imageUrl: string
  updateAt: number
  annonation: string
  color: string
}

interface NoteEntry {
  title: string
  url: string
  noteIdX: string
  wuCaiUrl: string
  createAt: number
  updateAt: number
  pageNote: string
  category: string
  highlights: Array<HighlightInfo>
}

interface NoteIdInfo {
  path: string
  updateAt: number
}

interface WuCaiPluginSettings {
  token: string
  wuCaiDir: string
  isSyncing: boolean
  frequency: string
  triggerOnLoad: boolean
  lastSyncFailed: boolean
  reimportShowConfirmation: boolean

  lastCursor: WuCaiExportLastCursor
  exportConfig: WuCaiExportConfig

  refreshNotes: boolean
  notesToRefresh: Array<string>
  notesPathIdsMap: { [key: string]: string } // key is path(also filename), value is noteId, ==> path vs. noteId
  notesIdsPathMap: { [key: string]: NoteIdInfo } // key is nodeId, value is path
}
