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

// 模板里可以使用的变量
interface WuCaiPageContext {
  title: string
  url: string // 原链接
  wucaiurl: string // 五彩后台链接
  readurl: string //全文剪藏链接
  tags: string
  pagenote: string
  pagescore: number // 星标
  createat: string
  updateat: string
  noteid: string
  createat_ts: number // 时间戳
  updateat_ts: number // 时间戳
  citekey: string
  author: string
  diffupdateat_ts: number // 不在同一天的更新时间，如果是同一天则为0
  domain: string
  domain2: string
  highlights: Array<HighlightInfo> // @todo 需要增加中间结构
}

interface HighlightInfo {
  note: string // 文字划线
  imageUrl: string // 图片划线
  updateAt: number // 更新时间
  annonation: string // 划线的想法
  color: string // 颜色
  slotId: number // 颜色id
  refid: string // 划线id
  url: string // 跳转原文url
}

interface NoteEntry {
  title: string
  url: string
  wucaiurl: string
  readurl: string
  noteIdX: string
  noteId: number
  createAt: number
  updateAt: number
  pageNote: string
  pageScore: number
  citekey: string
  author: string
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
  anno: string // 想法前导符
  color: string // 是否在第一行加一个颜色，优先级2
  color_tags: Array<string> // 颜色优先级1
  color_line: boolean // 是否对整行加颜色，优先级3
}
