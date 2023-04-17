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
  writeStyle: number // 写文件方式：1覆盖（默认），2追加
  titleStyle: number
  highlightStyle: number
  annotationStyle: number
  tagStyle: number
  haveWuCaiTag: number
  obTemplate: string
}

// 初始化接口返回的字段
interface ExportInitRequestResponse {
  lastCursor2: string
  exportConfig: WuCaiExportConfig
  totalNotes: number
  notesExported: number
  taskStatus: string
}

interface ExportDownloadResponse {
  notes: Array<NoteEntry>
  lastCursor2: string
}

// 从模板里分析出来的block模板代码
interface WuCaiBlocks {
  pagenote: string
  highlights: string
}

interface WuCaiHolders {
  title: string
  url: string
  tags: string
  pagenote: string
  highlights: Array<HighlightInfo>
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
  noteId: number
  wuCaiUrl: string
  createAt: number
  updateAt: number
  pageNote: string
  category: string
  tags: Array<string>
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

  lastCursor: string
  exportConfig: WuCaiExportConfig

  refreshNotes: boolean
  notesToRefresh: Array<string> // 更新出现异常的网页
}
