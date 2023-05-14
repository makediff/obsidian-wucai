interface WuCaiAuthResponse {
  accessToken: string
}

interface WuCaiExportLastCursor {
  lastId: number
  lastHighlightPKID: number
  lastTime: number
}

interface WuCaiExportConfig {
  titleTemplate: string // 标题模板格式
  writeStyle: number // 写文件方式：1覆盖（默认），2追加
  highlightStyle: number
  annotationStyle: number
  tagStyle: number
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

interface WuCaiPageContext {
  title: string
  url: string
  wucaiurl: string
  tags: string
  pagenote: string
  highlights: Array<HighlightInfo>
  createat: string
  updateat: string
  noteid: string
  createat_ts: number // 时间戳
  updateat_ts: number
  citekey: string
  author: string
}

interface HighlightInfo {
  note: string
  imageUrl: string
  updateAt: number
  annonation: string
  color: string
  slotId: number
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
  citekey: string
  author: string
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
  notesToRefresh: Array<string> // 更新出现异常的noteidx
  dataVersion: number // 本地数据版本号

  // 记录笔记对应的路径, key 是笔记id, value 是路径
  notePaths: { [key: string]: string } 
}

interface FilterPrettyOptions {
  prefix: string // 每行的前导符
  trim: boolean // 是否对行进行trim
  color: string // 是否在第一行加一个颜色
}

interface FilterStyle1Options {
  prefix: string // 每行的前导符
  trim: boolean // 是否对行进行trim
  color: string // 是否在第一行加一个颜色
  anno: string // 想法前导符
  color_tags: Array<string>
}
