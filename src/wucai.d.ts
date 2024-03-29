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
  obQuery: string
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
  mergedtags: string // 合并页面标签和笔记标签的tag列表
  pagenote: string
  pagescore: number // 星标
  notetype: string // 笔记类型, page, dailynote
  isstar: boolean
  ispagemirror: boolean //是否剪藏
  isdailynote: boolean
  createat: string
  updateat: string
  noteid: string
  createat_ts: number // 时间戳
  updateat_ts: number // 时间戳
  citekey: string
  author: string
  publishat: string
  publishat_ts: number
  diffupdateat_ts: number // 不在同一天的更新时间，如果是同一天则为0
  domain: string
  domain2: string
  highlights: Array<HighlightInfo>
  highlightcount: number // 划线数量
  mdcontent: string // 剪藏的markdown
}

// 接口返回的字段
interface HighlightInfoAPI {
  note: string // 文字划线
  imageUrl: string // 图片划线
  updateat: number
  createat: number
  highlighttype: number
  annonation: string // 划线的想法(单词拼写错误)
  color: string // 颜色
  slotid: number // 颜色id
  refid: string // 划线id
  refurl: string // 划线跳转链接
  url: string // 跳转原文url
}

// https://www.yuque.com/makediff/wucai/snoza8gdix68yfdn#dZ2Jr
interface HighlightInfo {
  note: string // 文字划线
  imageUrl: string // 图片划线
  updateat_ts: number
  createat_ts: number
  type: string // 划线类型
  annonation: string // 划线的想法(单词拼写错误)
  annotation: string // 解决单词拼写错误
  color: string // 颜色
  slotid: number // 颜色id
  refid: string // 划线id
  refurl: string // 划线跳转链接
}

interface NoteEntry {
  title: string
  url: string
  wucaiurl: string
  readurl: string
  sou: string
  noteIdX: string
  noteId: number
  noteType: number
  createAt: number
  updateAt: number
  pageNote: string
  pageScore: number
  citekey: string
  author: string
  publishat: number
  tags: Array<string> // 页面标签
  notetags: string // 笔记标签
  highlights: Array<HighlightInfoAPI>
}

interface NoteIdInfo {
  path: string
  updateAt: number
}

interface WuCaiPluginSettings {
  token: string
  wuCaiDir: string
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
  notePaths: { [key: string]: string } // 记录笔记对应的路径, key 是笔记id, value 是路径
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

interface FilterStyleDailyOptions {
  groupby: string
}
