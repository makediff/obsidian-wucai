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
  writeStyle: number // 写文件方式：1覆盖，2局部
  highlightStyle: number
  annotationStyle: number
  tagStyle: number
  obTemplate: string
  pageMirrorStyle: number
  truncateTile255: number
}

// 初始化接口返回的字段
interface ExportInitRequestResponse {
  lastCursor2: string
  exportConfig: WuCaiExportConfig
  totalNotes: number
  notesExported: number
  taskStatus: string
  downloadEP: string
}

interface ExportDownloadResponse {
  notes: Array<NoteEntry>
  lastCursor2: string
}

// 从模板里分析出来的block模板代码
interface WuCaiBlocks {
  pagenote: string
  highlights: string
  mdcontent: string
}

// 模板里可以使用的变量
interface WuCaiPageContext {
  title: string
  url: string // 原链接
  wucaiurl: string // 五彩后台链接
  readurl: string //全文剪藏链接
  tags: string // 包含前缀的标签，如 #read
  trimtags: string // 去掉前缀的标签，如 read
  pagenote: string
  pagescore: number // 星标
  isstar: boolean //是否星标
  ispagemirror: boolean //是否剪藏
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
  highlightcount: number // 划线数量
  mdcontent: string // 剪藏的markdown
}

interface HighlightInfo {
  note: string // 文字划线
  imageUrl: string // 图片划线
  updateAt: number // 更新时间
  annonation: string // 划线的想法
  color: string // 颜色
  slotId: number // 颜色id
  refid: string // 划线id
  refurl: string // 划线跳转链接
  url: string // 跳转原文url
  annotags: string // 想法的标签
}

interface NoteEntry {
  title: string
  url: string
  wucaiurl: string
  readurl: string
  sou: string
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
  downloadEP: string

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
  color_tags: Array<string> // 颜色优先级1
  color: string // 是否在第一行加一个颜色，优先级2，颜色块的名字
  color_line: boolean // 是否对整行加颜色，优先级3
  refid: boolean // 是否划线块引用
}
