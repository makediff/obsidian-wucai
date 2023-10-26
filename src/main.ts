import {
  App,
  ButtonComponent,
  Editor,
  MarkdownView,
  Modal,
  normalizePath,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  Vault,
  Platform,
  TFolder,
  TFile,
} from 'obsidian'
import * as zip from '@zip.js/zip.js'
import { StatusBar } from './status'
import { BGCONSTS } from './bgconsts'
import { WuCaiUtils } from './utils'
import { WuCaiTemplates } from './templates'

// the process.env variable will be replaced by its target value in the output main.js file
const WAITING_STATUSES = ['PENDING', 'RECEIVED', 'STARTED', 'RETRY']
const SUCCESS_STATUSES = ['SYNCING']
const API_URL_INIT = '/apix/openapi/wucai/sync/init'
const API_URL_DOWNLOAD = '/apix/openapi/wucai/sync/download'
const API_URL_ACK = '/apix/openapi/wucai/sync/ack'
const API_URL_DELETE_SERVER_NOTE = '/apix/openapi/wucai/sync/delete'
const API_URL_ARCHIVE_NOTE = '/apix/openapi/wucai/sync/archive'

const WRITE_STYLE_OVERWRITE = 1 // 覆盖
const WRITE_STYLE_APPEND = 2 // 局部更新

// define our initial settings
const DEFAULT_SETTINGS: WuCaiPluginSettings = {
  token: '',
  wuCaiDir: 'WuCai',
  frequency: '0', // 0代表默认手动同步
  triggerOnLoad: true,
  lastSyncFailed: false,
  refreshNotes: false,
  notesToRefresh: [], // 待更新文件列表
  reimportShowConfirmation: true,
  lastCursor: '',
  dataVersion: 0,
  downloadEP: '',
  notePaths: {},
  exportConfig: {
    pageMirrorStyle: 2,
    truncateTile255: 0,
    writeStyle: 2,
    highlightStyle: 1,
    annotationStyle: 1,
    tagStyle: 1,
    obTemplate: '',
    titleTemplate: '',
  },
}

// const localizeData = {
//   /**
//    * Run sync
//    * Synced
//    * Run sync
//    * Exporting WuCai data
//    * Building export...
//    * sync service expried
//    * Sync failed
//    * need advanced permission
//    */
//   CN: {
//     'call api failed': '',
//     "Can't connect to server": '',
//   },
// }

function logger(msg: any) {
  BGCONSTS.IS_DEBUG && console.log(msg)
}

function localize(msg: string): string {
  return msg
}

export default class WuCaiPlugin extends Plugin {
  settings: WuCaiPluginSettings
  scheduleInterval: null | number = null
  statusBar: StatusBar
  pageTemplate: WuCaiTemplates // 渲染模板
  isSyncing: boolean

  // 对接口返回的内容进行检查
  // 如果有错误返回 true, 否则返回 false
  checkResponseBody(buttonContext: ButtonComponent, rsp: any): boolean {
    if (!rsp) {
      return false
    }
    if (rsp && 1 === rsp.code) {
      return false
    }
    let errCode = rsp.code
    if (10000 === errCode) {
      // 无效的 Token ，需要重新生成
      this.settings.token = ''
    } else if (10100 === errCode || 10101 === errCode) {
      // 同步服务到期了
      this.settings.token = ''
    }
    let err = localize(rsp['message'] || 'call api failed')
    if (errCode) {
      err += ', error:' + errCode
    }
    this.handleSyncError(buttonContext, err)
    return true
  }

  getErrorMessageFromResponse(response: Response) {
    if (response && response.status === 409) {
      return 'Sync in progress initiated by different client'
    }
    if (response && response.status === 417) {
      return 'Obsidian export is locked. Wait for an hour.'
    }
    return `${response ? response.statusText : "Can't connect to server"}`
  }

  handleSyncError(buttonContext: ButtonComponent, msg: string) {
    this.settings.lastSyncFailed = true
    this.saveSettings()
    if (buttonContext) {
      this.showInfoStatus(buttonContext.buttonEl.parentElement, msg, 'wc-error')
      buttonContext.buttonEl.setText(localize('Run sync'))
    } else {
      this.notice(msg, true, 4, true)
    }
  }

  handleSyncSuccess(buttonContext: ButtonComponent, msg: string = 'Synced', lastCursor: string = '') {
    this.settings.lastSyncFailed = false
    if (lastCursor) {
      let tmpCursor = this.getLastCursor(lastCursor, this.settings.lastCursor)
      if (tmpCursor) {
        this.settings.lastCursor = tmpCursor
      }
    }
    this.saveSettings()
    // if we have a button context, update the text on it
    // this is the case if we fired on a "Run sync" click (the button)
    if (buttonContext) {
      this.showInfoStatus(buttonContext.buttonEl.parentNode.parentElement, msg, 'wc-success')
      buttonContext.buttonEl.setText('Run sync')
    }
  }

  async callApi(url: string, params: any) {
    const reqtime = Math.floor(+new Date() / 1000)
    params['v'] = BGCONSTS.VERSION_NUM
    params['serviceId'] = BGCONSTS.SERVICE_ID
    url += `?appid=${BGCONSTS.APPID}&ep=${BGCONSTS.ENDPOINT}&version=${BGCONSTS.VERSION}&reqtime=${reqtime}`
    let lastUrl
    if (url[0] == '/') {
      lastUrl = BGCONSTS.BASE_URL + url
    } else {
      lastUrl = url
    }
    return fetch(lastUrl, {
      headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  // 初始化同步
  async exportInit(buttonContext?: ButtonComponent, auto?: boolean, flagx = '') {
    const dirInfo = this.app.vault.getAbstractFileByPath(this.settings.wuCaiDir)
    const isDirDeleted = !dirInfo || !(dirInfo instanceof TFolder)
    if (isDirDeleted) {
      this.settings.lastCursor = ''
      this.settings.notesToRefresh = []
      this.settings.notePaths = {}
    }
    logger({
      msg: 'onload last cursor',
      lastCursor: this.settings.lastCursor,
      flagx,
      isDirDeleted,
      isSync: this.isSyncing,
    })
    let lastCursor2 = this.settings.lastCursor
    let params = { noteDirDeleted: isDirDeleted, lastCursor2 }
    let rsp
    try {
      rsp = await this.callApi(API_URL_INIT, params)
    } catch (e) {
      logger({ msg: 'WuCai Official plugin: fetch failed in exportInit: ', e })
    }
    if (!rsp || !rsp.ok) {
      logger({ msg: 'WuCai Official plugin: bad response in exportInit: ', rsp })
      this.handleSyncError(buttonContext, this.getErrorMessageFromResponse(rsp))
      this.isSyncing = false
      return
    }

    let data2 = await rsp.json()
    if (this.checkResponseBody(buttonContext, data2)) {
      this.isSyncing = false
      return
    }

    let initRet: ExportInitRequestResponse = data2['data'] || {}
    logger({ msg: 'in exportInit', initRet, lastCursor: this.settings.lastCursor, flagx })

    this.settings.exportConfig = initRet.exportConfig
    this.settings.downloadEP = initRet.downloadEP || ''

    // 每次都使用最新的配置，重新预编译模板
    const compileErrMessage = this.pageTemplate.precompile(initRet.exportConfig.obTemplate)

    let tmpCursor = this.getLastCursor(initRet.lastCursor2, this.settings.lastCursor)
    if (tmpCursor) {
      this.settings.lastCursor = tmpCursor
    }

    await this.saveSettings()

    if ('SYNCED' === initRet.taskStatus) {
      this.handleSyncSuccess(buttonContext, 'Synced', this.settings.lastCursor)
      let msg = 'Latest WuCai sync already happened on your other device. Data should be up to date'
      this.notice(msg, false, 4, true)
      logger({ msg: 'syncing -> false', flagx: flagx + ' init+ck+synced' })
      this.isSyncing = false
    } else if ('EXPIRED' == initRet.taskStatus) {
      this.handleSyncError(buttonContext, 'sync service expried')
      logger({ msg: 'syncing -> false', flagx: flagx + ' init+ck+expired' })
      this.isSyncing = false
    } else if (WAITING_STATUSES.includes(initRet.taskStatus)) {
      if (initRet.notesExported > 0) {
        const progressMsg = localize('Exporting WuCai data') + ` (${initRet.notesExported} / ${initRet.totalNotes}) ...`
        this.notice(progressMsg)
      } else {
        this.notice('Building export...')
      }
      // 等待后重试
      await new Promise((resolve) => setTimeout(resolve, 3000))
      await this.exportInit(buttonContext, false, 'exportInit timeout')
    } else if (SUCCESS_STATUSES.includes(initRet.taskStatus)) {
      this.notice('Syncing WuCai data')
      // 1) 先将同步点位之前有更新的数据更新完
      // 2) 再从点位开始，将新数据同步过来
      await this.downloadArchive(this.settings.lastCursor, [], buttonContext, flagx + ' init+ck', true)
    } else {
      this.handleSyncError(buttonContext, 'Sync failed,' + initRet.taskStatus)
      logger({ msg: 'syncing -> false', flagx: flagx + ' init+ck+exception' })
      this.isSyncing = false
    }
  }

  notice(msg: string, show = false, timeout = 0, forcing: boolean = false) {
    if (show) {
      new Notice(msg)
    }
    // @ts-ignore
    if (!Platform.isMobileApp) {
      this.statusBar.displayMessage(msg.toLowerCase(), timeout, forcing)
    } else if (!show) {
      new Notice(msg)
    }
  }

  showInfoStatus(container: HTMLElement, msg: string, className = '') {
    let info = container.find('.wc-info-container')
    if (info) {
      info.setText(msg)
      info.addClass(className)
    }
  }

  clearInfoStatus(container: HTMLElement) {
    let info = container.find('.wc-info-container')
    info.empty()
  }

  getAuthHeaders() {
    let tk = this.settings.token || ''
    return {
      AUTHORIZATION: `Token ${tk}`,
      'Obsidian-Client': `${this.getObsidianClientID()}`,
    }
  }

  // 计算新的同步位置
  getLastCursor(newCursor: string, savedCursor: string): string {
    if (newCursor === savedCursor) {
      // 不需要变更
      return ''
    }
    if (newCursor && newCursor.length > 0) {
      return newCursor
    }
    return savedCursor
  }

  // 遍历页面并生成文件
  async processEntity(entry: NoteEntry, titleTpl: string) {
    let filename: string
    let urldomain: string = WuCaiUtils.getDomainByUrl(entry.url)
    let urldomain2: string = WuCaiUtils.getDomain2ByDomain(urldomain)
    const isdailynote = entry.noteType === 3
    const notetype = isdailynote ? 'dailynote' : 'page'
    if (WuCaiTemplates.isNeedRender(titleTpl)) {
      const titleTemplate = this.pageTemplate.getTitleTemplateByStr(titleTpl)
      const nameParams = {
        title: WuCaiUtils.normalTitle(entry.title),
        createat_ts: entry.createAt,
        updateat_ts: Math.max(entry.updateAt, entry.createAt),
        domain2: urldomain2 || '', // 仅保留2级的域名
        domain: urldomain || '', // 当前url的域名
        notetype,
        isdailynote,
      }
      filename = titleTemplate.render(nameParams)
    } else {
      filename = titleTpl
    }

    const exportCfg = this.settings.exportConfig
    if (exportCfg.truncateTile255 > 0) {
      let suffLen = `-${entry.noteIdX}.md`.length
      filename = WuCaiUtils.truncateFileName255(filename, suffLen)
    }

    // 根据规则生成文件路径
    filename = `${this.settings.wuCaiDir}/${filename}-${entry.noteIdX}.md`

    const outFilename = normalizePath(filename).replace(/[\/ \s]+$/, '')
    if (!outFilename || outFilename.length <= 0) {
      return
    }

    let isDirChecked = false
    const oldPath = this.settings.notePaths[entry.noteIdX] || ''
    if (oldPath && oldPath != outFilename) {
      // 将本地的文件rename成新的文件，因为文件标题有改动
      const oldPathInfo = await this.app.vault.getAbstractFileByPath(oldPath)
      if (oldPathInfo && oldPathInfo instanceof TFile) {
        const dirPath = WuCaiUtils.getDirFromPath(outFilename)
        if (dirPath) {
          const fileInfo = await this.app.vault.getAbstractFileByPath(dirPath)
          if (!fileInfo || !(fileInfo instanceof TFolder)) {
            await this.app.vault.createFolder(dirPath)
            isDirChecked = true
          }
        }
        await this.app.vault.rename(oldPathInfo, outFilename)
      }
    }

    this.settings.notePaths[entry.noteIdX] = outFilename

    try {
      // const contents = await entry.getData(new zip.TextWriter())
      if (!isDirChecked) {
        const dirPath = WuCaiUtils.getDirFromPath(outFilename)
        if (dirPath) {
          const fileInfo = await this.app.vault.getAbstractFileByPath(dirPath)
          if (!fileInfo || !(fileInfo instanceof TFolder)) {
            await this.app.vault.createFolder(dirPath)
          }
        }
      }

      entry.highlights = entry.highlights || []
      entry.pageScore = entry.pageScore || 0

      const isHashTag = exportCfg.tagStyle === 1
      const isstar = entry.pageScore > 0
      const tags = WuCaiUtils.formatTags(entry.tags, isHashTag)
      const trimtags = WuCaiUtils.trimTags(entry.tags)
      const mergedtags = WuCaiUtils.mergeTagsAndTrim(entry.tags, entry.notetags)
      let mdcontent = ''
      let ispagemirror = false
      if (exportCfg.pageMirrorStyle !== 2 && entry.sou && entry.sou.length > 0) {
        mdcontent = await WuCaiUtils.getPageMirrorMarkdown(entry.sou || '')
        ispagemirror = true
      }
      const pageCtx: WuCaiPageContext = {
        title: WuCaiUtils.formatPageTitle(entry.title),
        url: entry.url,
        wucaiurl: entry.wucaiurl || '',
        readurl: entry.readurl || '',
        tags,
        trimtags,
        mergedtags,
        notetype,
        pagenote: WuCaiUtils.formatPageNote(entry.pageNote, isHashTag),
        pagescore: entry.pageScore,
        isstar,
        ispagemirror,
        isdailynote,
        highlights: WuCaiUtils.formatHighlights(entry.url, entry.highlights, exportCfg),
        highlightcount: entry.highlights.length,
        createat: WuCaiUtils.formatTime(entry.createAt),
        createat_ts: entry.createAt,
        updateat: WuCaiUtils.formatTime(entry.updateAt),
        updateat_ts: entry.updateAt,
        noteid: entry.noteIdX,
        citekey: entry.citekey || '',
        author: entry.author || '',
        publishat: WuCaiUtils.formatTime(entry.publishat),
        publishat_ts: entry.publishat || 0,
        diffupdateat_ts: WuCaiUtils.getDiffDay(entry.createAt, entry.updateAt),
        domain: urldomain,
        domain2: urldomain2,
        mdcontent,
      }
      const noteFile = await this.app.vault.getAbstractFileByPath(outFilename)
      const isNoteExists = noteFile && noteFile instanceof TFile
      if (!isNoteExists || WRITE_STYLE_OVERWRITE === exportCfg.writeStyle) {
        // 全量渲染整个页面里的所有内容
        const contents = WuCaiUtils.renderTemplate(pageCtx, this.pageTemplate)
        if (isNoteExists) {
          await this.app.vault.modify(noteFile, contents)
        } else {
          await this.app.vault.create(outFilename, contents)
        }
      } else if (WRITE_STYLE_APPEND === exportCfg.writeStyle) {
        // 局部更新，仅会更新页面笔记和划线列表，添加到尾部，其他部分不改动
        const oldCnt = await this.app.vault.read(noteFile)
        const contents = WuCaiUtils.renderTemplateWithEditable(pageCtx, oldCnt, this.pageTemplate)
        await this.app.vault.modify(noteFile, contents)
      } else {
        // write style error, do nothing
        this.notice(`WuCai: error writeStyle ${exportCfg.writeStyle}`, true, 4, true)
      }
    } catch (e) {
      logger([`WuCai Official plugin: error writing ${outFilename}:`, e])
      this.notice(`WuCai: error while writing ${outFilename}: ${e}`, true, 4, true)
      if (entry.noteIdX) {
        this.settings.notesToRefresh.push(entry.noteIdX)
        await this.saveSettings()
      }
    }
    return
  }

  // 指定范围或指定笔记进行同步
  async downloadArchive(
    lastCursor2: string,
    noteIdXs: Array<string>,
    buttonContext: ButtonComponent,
    flagx: string = '',
    checkUpdate: boolean = false
  ): Promise<void> {
    let response
    const writeStyle = this.settings.exportConfig.writeStyle
    logger({ msg: 'download', checkUpdate, flagx, lastCursor2, isSyncing: this.isSyncing })
    try {
      const lastUrl = this.settings.downloadEP + API_URL_DOWNLOAD
      response = await this.callApi(lastUrl, {
        lastCursor2,
        noteIdXs,
        flagx,
        writeStyle,
        out: BGCONSTS.OUT,
        checkUpdate,
      })
    } catch (e) {
      logger({ msg: 'WuCai Official plugin: fetch failed in downloadArchive: ', e })
    }
    if (!response || !response.ok) {
      logger({ msg: 'WuCai Official plugin: bad response in downloadArchive: ', response })
      this.handleSyncError(buttonContext, this.getErrorMessageFromResponse(response))
      if (!checkUpdate) {
        logger({ msg: 'syncing -> false', flagx: flagx + ' download+exception' })
        this.isSyncing = false
      }
      return
    }

    // let blob = await response.blob()
    const data2 = await response.json()
    if (this.checkResponseBody(buttonContext, data2)) {
      if (!checkUpdate) {
        logger({ msg: 'syncing -> false', flagx: flagx + ' download+nil' })
        this.isSyncing = false
      }
      return
    }

    const downloadRet: ExportDownloadResponse = data2['data']
    let entries: Array<NoteEntry> = downloadRet.notes || []

    // const blobReader = new zip.BlobReader(blob)
    // const zipReader = new zip.ZipReader(blobReader)
    // const entries = await zipReader.getEntries()

    // 是否为定向同步
    const isPartsDownload: boolean = noteIdXs.length > 0
    const entriesCount = entries.length

    // 预编译标题模板
    const exportCfg = this.settings.exportConfig
    let titleTpl: string = exportCfg.titleTemplate || 'wucai-{{ createat_ts | date("YYYY-MM-DD") }}'
    titleTpl = titleTpl.replace(/[\n]+/, '').trim()

    for (const entry of entries) {
      if (!entry) {
        continue
      }
      await this.processEntity(entry, titleTpl)
    }

    let isCompleted = false
    if (isPartsDownload) {
      // 当前是指定笔记进行同步，所以每次就代表一组同步完成
      isCompleted = true
    } else {
      // 更新同步位置
      let tmpCursor = this.getLastCursor(downloadRet.lastCursor2, lastCursor2)
      if (tmpCursor) {
        this.settings.lastCursor = tmpCursor
        isCompleted = entriesCount <= 0
      } else {
        // 因为某种原因导致的定位异常，结束同步
        isCompleted = true
      }
    }
    await this.saveSettings()

    // close the ZipReader
    // await zipReader.close()

    if (isCompleted) {
      if (checkUpdate) {
        // 如果检查更新完成，则开始增量同步
        this.downloadArchive(this.settings.lastCursor, [], buttonContext, flagx, !checkUpdate)
      } else {
        logger({ msg: 'syncing -> false', flagx: flagx + ' download+done' })
        this.isSyncing = false
        await this.acknowledgeSyncCompleted(buttonContext)
        this.handleSyncSuccess(buttonContext, 'Synced!', this.settings.lastCursor)
        this.notice('WuCai sync completed', true, 1, true)
        // @ts-ignore
        if (Platform.isMobileApp) {
          this.notice("If you don't see all of your WuCai files reload obsidian app", true)
        }
      }
    } else {
      this.handleSyncSuccess(buttonContext, 'syncing', this.settings.lastCursor)
      // this.notice('WuCai is syncing, ' + exportID, true, 1, true)
      await new Promise((resolve) => setTimeout(resolve, 5000))
      this.downloadArchive(this.settings.lastCursor, [], buttonContext, flagx, checkUpdate)
    }
  }

  // 同步完成后，确认同步点位
  async acknowledgeSyncCompleted(buttonContext: ButtonComponent) {
    let rsp
    try {
      let params = { lastCursor2: this.settings.lastCursor }
      rsp = await this.callApi(API_URL_ACK, params)
    } catch (e) {
      logger(['WuCai Official plugin: fetch failed to acknowledged sync: ', e])
    }
    if (rsp && !rsp.ok) {
      logger(['WuCai Official plugin: bad response in acknowledge sync: ', rsp])
      this.handleSyncError(buttonContext, this.getErrorMessageFromResponse(rsp))
    }
  }

  async configureSchedule() {
    const minutes = parseInt(this.settings.frequency)
    let milliseconds = minutes * 60 * 1000 // minutes * seconds * milliseconds
    logger(['WuCai Official plugin: setting interval to ', minutes, 'minutes'])
    window.clearInterval(this.scheduleInterval)
    this.scheduleInterval = null
    if (!milliseconds) {
      return
    }
    this.scheduleInterval = window.setInterval(() => {
      if (this.isSyncing) {
        return
      }
      this.isSyncing = true
      logger(['start sync, schedule', this.settings.lastCursor, this.isSyncing])
      this.exportInit(null, true, 'schedule init')
    }, milliseconds)
    this.registerInterval(this.scheduleInterval)
  }

  async refreshNoteExport() {
    if (!this.settings.refreshNotes) {
      return
    }
    let noteIds = this.settings.notesToRefresh || []
    if (noteIds.length <= 0) {
      return
    }
    let newNoteIds: Array<string> = []
    for (let i = 0; i < noteIds.length; i++) {
      newNoteIds.push(noteIds[i])
      if (i >= 5) {
        break
      }
    }
    this.downloadArchive(null, newNoteIds, null, 'refresh')
    this.settings.notesToRefresh = this.settings.notesToRefresh.filter((n) => !newNoteIds.includes(n))
  }

  async addNoteToRefresh(noteId: string) {
    this.settings.notesToRefresh.push(noteId)
    await this.saveSettings()
  }

  reimportFile(vault: Vault, fileName: string) {
    // const noteId = this.settings.notesPathIdsMap[fileName]
    // if (!noteId) {
    //   this.notice('Failed to reimport. note id not found', true)
    //   return
    // }
    // this.downloadArchive(null, [parseInt(noteId)], null)
  }

  startSync() {
    logger(['sync status', this.isSyncing])
    if (this.isSyncing) {
      this.notice('WuCai sync already in progress', true)
      return
    }
    this.isSyncing = true
    this.saveSettings()
    this.exportInit(null, false, 'startSync init')
  }

  async onload() {
    // @ts-ignore
    if (!Platform.isMobileApp) {
      this.statusBar = new StatusBar(this.addStatusBarItem())
      this.registerInterval(window.setInterval(() => this.statusBar.display(), 1000))
    }
    let thiz = this
    await this.loadSettings()
    // this.registerEvent(
    //   this.app.vault.on('delete', async (file) => {
    //     // 将删除的文件放到待更新列表，这样下次就可以重新同步删除的问题
    //     const noteID = this.settings.notesPathIdsMap[file.path]
    //     if (noteID) {
    //       await this.addNoteToRefresh(noteID)
    //     }
    //     // delete this.settings.notesPathIdsMap[file.path]
    //     // delete this.settings.notesIdsPathMap[noteID]
    //     this.saveSettings()
    //     if (noteID) {
    //       this.refreshNoteExport()
    //     }
    //   })
    // )
    // this.registerEvent(
    //   this.app.vault.on('rename', (file, oldPath) => {
    //     // 如果是五彩划线目录里的文件，在重命名的时候，进行关联，以保证下次同步能找到相应的文件
    //     if (!oldPath.startsWith(this.settings.wuCaiDir + '/')) {
    //       return
    //     }
    //     logger(['rename path', file, oldPath])
    //     const noteID = this.settings.notesPathIdsMap[oldPath]
    //     if (!noteID) {
    //       // 检测是否是修改的目录，如果是目录，则需要更新目录下的所有映射关系
    //       let oldPathLength = oldPath.length
    //       for (let tmpNoteId in this.settings.notesIdsPathMap) {
    //         let note: NoteIdInfo = this.settings.notesIdsPathMap[tmpNoteId]
    //         if (!note || note == undefined) {
    //           continue
    //         }
    //         let tmpOldPath = note.path
    //         if (tmpOldPath.startsWith(oldPath + '/')) {
    //           // 更新此文件夹下面的文件映射关系
    //           let tmpNewPath = file.path + tmpOldPath.substring(oldPathLength)
    //           logger(['rename map, ', oldPath, tmpOldPath, tmpNewPath])
    //           delete this.settings.notesPathIdsMap[tmpOldPath]
    //           this.settings.notesPathIdsMap[tmpNewPath] = tmpNoteId
    //           this.settings.notesIdsPathMap[tmpNoteId].path = tmpNewPath
    //         }
    //       }
    //       return
    //     }
    //     this.settings.notesPathIdsMap[file.path] = noteID
    //     this.settings.notesIdsPathMap[noteID].path = file.path
    //     delete this.settings.notesPathIdsMap[oldPath]
    //     this.saveSettings()
    //   })
    // )
    this.addCommand({
      id: 'sync',
      name: 'Sync your data now',
      callback: () => {
        this.startSync()
      },
    })
    this.addCommand({
      id: 'archive',
      name: 'Archive this file',
      editorCallback(editor, view) {
        const activeFilePath = view.file.path
        const noteid = WuCaiUtils.getNoteIdxFromFilePath(activeFilePath)
        if (noteid.length <= 0) {
          thiz.notice('error, error file title', true, 4, true)
          return
        }
        try {
          thiz.callApi(API_URL_ARCHIVE_NOTE, { noteid }).then(async function (rsp) {
            if (!rsp || !rsp.ok) {
              logger({ msg: 'WuCai Official plugin: bad response in delete server note: ', rsp })
              thiz.handleSyncError(null, thiz.getErrorMessageFromResponse(rsp))
              return
            }
            let data2 = await rsp.json()
            console.log({ data2 })
            if (thiz.checkResponseBody(null, data2)) {
              return
            }
            thiz.notice('archive file success', true, 4, true)
          })
        } catch (e) {
          logger({ msg: 'WuCai Official plugin: archive note, error ', e })
        }
      },
    })
    this.addCommand({
      id: 'deletefromserver',
      name: 'Delete this file from server',
      editorCallback(editor, view) {
        const activeFilePath = view.file.path
        const noteid = WuCaiUtils.getNoteIdxFromFilePath(activeFilePath)
        if (noteid.length <= 0) {
          thiz.notice('error, error file title', true, 4, true)
          return
        }
        try {
          thiz.callApi(API_URL_DELETE_SERVER_NOTE, { noteid }).then(async function (rsp) {
            if (!rsp || !rsp.ok) {
              logger({ msg: 'WuCai Official plugin: bad response in delete server note: ', rsp })
              thiz.handleSyncError(null, thiz.getErrorMessageFromResponse(rsp))
              return
            }
            let data2 = await rsp.json()
            if (thiz.checkResponseBody(null, data2)) {
              return
            }
            thiz.notice('delete file success', true, 4, true)
          })
        } catch (e) {
          logger({ msg: 'WuCai Official plugin: delete server note, error ', e })
        }
      },
    })
    // this.addCommand({
    //   id: 'reimport',
    //   name: 'Delete and reimport this document',
    //   editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
    //     const activeFilePath = view.file.path
    //     // const isRWfile = activeFilePath in this.settings.notesPathIdsMap
    //     // if (checking) {
    //     //   return isRWfile
    //     // }
    //     if (this.settings.reimportShowConfirmation) {
    //       const modal = new Modal(view.app)
    //       modal.contentEl.createEl('p', {
    //         text:
    //           'Warning: Proceeding will delete this file entirely (including any changes you made) ' +
    //           'and then reimport a new copy of your highlights from WuCai.',
    //       })
    //       const buttonsContainer = modal.contentEl.createEl('div', { cls: 'wc-modal-btns' })
    //       const cancelBtn = buttonsContainer.createEl('button', { text: 'Cancel' })
    //       const confirmBtn = buttonsContainer.createEl('button', { text: 'Proceed', cls: 'mod-warning' })
    //       const showConfContainer = modal.contentEl.createEl('div', { cls: 'wc-modal-confirmation' })
    //       showConfContainer.createEl('label', { attr: { for: 'wc-ask-nl' }, text: "on't ask me in the future" })
    //       const showConf = showConfContainer.createEl('input', { type: 'checkbox', attr: { name: 'wc-ask-nl' } })
    //       showConf.addEventListener('change', (ev) => {
    //         // @ts-ignore
    //         this.settings.reimportShowConfirmation = !ev.target.checked
    //         this.saveSettings()
    //       })
    //       cancelBtn.onClickEvent(() => {
    //         modal.close()
    //       })
    //       confirmBtn.onClickEvent(() => {
    //         this.reimportFile(view.app.vault, activeFilePath)
    //         modal.close()
    //       })
    //       modal.open()
    //     } else {
    //       this.reimportFile(view.app.vault, activeFilePath)
    //     }
    //   },
    // })
    // this.registerMarkdownPostProcessor((el, ctx) => {
    //   logger({ msg: 'registerMarkdownPostProcessor', pth: ctx.sourcePath, d: thiz.settings.wuCaiDir })
    //   if (!ctx.sourcePath.startsWith(thiz.settings.wuCaiDir)) {
    //     return
    //   }

    //   // let matches: string[]
    //   // try {
    //   //   // @ts-ignore
    //   //   matches = [...ctx.getSectionInfo(el).text.matchAll(/__(.+)__/g)].map((a) => a[1])
    //   // } catch (TypeError) {
    //   //   // failed interaction with a Dataview element
    //   //   return
    //   // }
    //   // const hypers = el.findAll('strong')//.filter((e) => matches.contains(e.textContent))
    //   // hypers.forEach((strongEl) => {
    //   //   const replacement = el.createEl('span')
    //   //   while (strongEl.firstChild) {
    //   //     replacement.appendChild(strongEl.firstChild)
    //   //   }
    //   //   replacement.addClass('wc-hyper-highlight')
    //   //   strongEl.replaceWith(replacement)
    //   // })
    // })
    this.addSettingTab(new WuCaiSettingTab(this.app, this))
    await this.configureSchedule()
    this.isSyncing = false // 启动的时候初始化非同步状态
    if (this.settings.token && this.settings.triggerOnLoad && !this.isSyncing) {
      // 因为加载关系，如果目录没有创建，可能是ob还没有启动完成
      const dirInfo = this.app.vault.getAbstractFileByPath(this.settings.wuCaiDir)
      const isDirNotExists = !dirInfo || !(dirInfo instanceof TFolder)
      if (isDirNotExists) {
        this.app.workspace.onLayoutReady(() => {
          // https://forum.obsidian.md/t/plugins-with-a-lot-to-do-at-startup-being-async-onlayoutready/26205
          logger(['onload last cursor 1', this.settings.lastCursor, this.isSyncing])
          if (this.isSyncing) {
            return
          }
          this.isSyncing = true
          this.exportInit(null, true, 'onload + not exists')
        })
      } else {
        this.isSyncing = true
        await this.exportInit(null, true, 'onload + exists 2')
        // await this.refreshNoteExport() // 同步上次出错的网页
        logger(['onload last cursor 2', this.settings.lastCursor])
      }
    }
  }

  onunload() {
    // 暂时没有逻辑需要处理
    return
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
    this.pageTemplate = new WuCaiTemplates()
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }

  resetObsidianClientID() {
    window.localStorage.setItem('wc-ObsidianClientId', '')
    return this.getObsidianClientID()
  }

  getObsidianClientID() {
    let tmpId = window.localStorage.getItem('wc-ObsidianClientId') || ''
    if (tmpId && tmpId.length > 0) {
      return tmpId
    }
    tmpId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
    window.localStorage.setItem('wc-ObsidianClientId', tmpId)
    return tmpId
  }

  async getUserAuthToken(button: HTMLElement, attempt = 0) {
    let uuid = this.getObsidianClientID()
    if (attempt === 0) {
      window.open(`${BGCONSTS.BASE_URL}/page/gentoken/${BGCONSTS.SERVICE_ID}/${uuid}`)
    }
    let response
    try {
      let url = '/page/auth/openapi/gettoken'
      response = await this.callApi(url, { did: uuid })
    } catch (e) {
      logger({ msg: 'WuCai Official plugin: fetch failed in getUserAuthToken: ', e })
    }
    if (!response || !response.ok) {
      logger({ msg: 'WuCai Official plugin: bad response in getUserAuthToken: ', response })
      this.showInfoStatus(button.parentElement, 'Authorization failed. Try again', 'wc-error')
      return
    }
    let data2 = await response.json()
    let data: WuCaiAuthResponse
    data = data2['data']
    if (1 === data2.code && data.accessToken) {
      this.settings.token = data.accessToken
    } else {
      if (attempt > 20) {
        logger({ msg: 'WuCai Official plugin: reached attempt limit in getUserAuthToken' })
        return
      }
      logger({ msg: `WuCai Official plugin: didn't get token data`, attempt })
      await new Promise((resolve) => setTimeout(resolve, 1000))
      await this.getUserAuthToken(button, attempt + 1)
    }
    await this.saveSettings()
    return true
  }
}

class WuCaiSettingTab extends PluginSettingTab {
  plugin: WuCaiPlugin

  constructor(app: App, plugin: WuCaiPlugin) {
    super(app, plugin)
    this.plugin = plugin
    this.plugin.isSyncing = false
  }

  display(): void {
    let clientId = this.plugin.getObsidianClientID() || ''
    let { containerEl } = this
    containerEl.empty()
    containerEl.createEl('h1', { text: 'WuCai Highlights Official' })
    containerEl
      .createEl('p', { text: 'Created by ' })
      .createEl('a', { text: '希果壳五彩', href: 'https://www.dotalk.cn/product/wucai' })
    containerEl.getElementsByTagName('p')[0].appendText(` Version ${BGCONSTS.VERSION}`)
    containerEl.createEl('h2', { text: 'Settings' })

    let token = this.plugin.settings.token
    if (token && token.length > 0) {
      new Setting(containerEl)
        .setName('Sync your WuCai data with Obsidian')
        .setDesc('On first sync, the WuCai plugin will create a new folder containing all your highlights')
        .setClass('wc-setting-sync')
        .addButton((button) => {
          button
            .setCta()
            .setTooltip('Once the sync begins, you can close this plugin page')
            .setButtonText('Initiate Sync')
            .onClick(async () => {
              if (this.plugin.isSyncing) {
                new Notice('WuCai sync already in progress')
              } else {
                this.plugin.clearInfoStatus(containerEl)
                await this.plugin.saveData(this.plugin.settings)
                button.setButtonText('Syncing...')
                this.plugin.isSyncing = true
                await this.plugin.exportInit(button)
              }
            })
        })
      let el = containerEl.createEl('div', { cls: 'wc-info-container' })
      containerEl.find('.wc-setting-sync > .setting-item-control ').prepend(el)

      new Setting(containerEl)
        .setName('Customize formatting options')
        .setDesc('You can customize which items export to Obsidian and how they appear from the WuCai website')
        .addButton((button) => {
          button.setButtonText('Customize').onClick(() => {
            window.open(`${BGCONSTS.BASE_URL}/page/plugins/obsidian/preferences`)
          })
        })

      new Setting(containerEl)
        .setName('Customize base folder')
        .setDesc('By default, the plugin will save all your highlights into a folder named WuCai')
        .addText((text) =>
          text
            .setPlaceholder('Defaults to: WuCai')
            .setValue(this.plugin.settings.wuCaiDir)
            .onChange(async (value) => {
              if (this.plugin.isSyncing) {
                new Notice('WuCai sync already in progress')
                return
              }
              this.plugin.settings.wuCaiDir = normalizePath(value || 'WuCai')
              await this.plugin.saveSettings()
            })
        )

      new Setting(containerEl)
        .setName('Configure resync frequency')
        .setDesc(
          'If not set to Manual, WuCai will automatically resync with Obsidian when the app is open at the specified interval'
        )
        .addDropdown((dropdown) => {
          dropdown.addOption('0', 'Manual')
          dropdown.addOption('180', 'Every 3 hour')
          dropdown.addOption((12 * 60).toString(), 'Every 12 hours')
          dropdown.addOption((24 * 60).toString(), 'Every 24 hours')
          dropdown.setValue(this.plugin.settings.frequency)
          dropdown.onChange((newValue) => {
            this.plugin.settings.frequency = newValue
            this.plugin.saveSettings()
            this.plugin.configureSchedule()
          })
        })
      new Setting(containerEl)
        .setName('Sync automatically when Obsidian opens')
        .setDesc('If enabled, WuCai will automatically resync with Obsidian each time you open the app')
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.triggerOnLoad)
          toggle.onChange((val) => {
            this.plugin.settings.triggerOnLoad = val
            this.plugin.saveSettings()
          })
        })
      // new Setting(containerEl)
      //   .setName('Clear up sync location')
      //   .setDesc('If cleared, will be resync all of your files')
      //   .setClass('wc-setting-danger')
      //   .addButton((button) => {
      //     button.setCta().setButtonText('Clear up sync location')
      //     button.onClick(async (val) => {
      //       if (this.plugin.isSyncing) {
      //         new Notice('WuCai sync already in progress')
      //         return
      //       }
      //       this.plugin.settings.lastCursor = ''
      //       await this.plugin.saveSettings()
      //       new Notice('Clear up Success')
      //     })
      //   })
      // new Setting(containerEl)
      //   .setName('Resync deleted files')
      //   .setDesc(
      //     'If enabled, you can refresh individual items by deleting the file in Obsidian and initiating a resync'
      //   )
      //   .addToggle((toggle) => {
      //     toggle.setValue(this.plugin.settings.refreshNotes)
      //     toggle.onChange(async (val) => {
      //       this.plugin.settings.refreshNotes = val
      //       await this.plugin.saveSettings()
      //       if (val) {
      //         this.plugin.refreshNoteExport()
      //       }
      //     })
      //   })
      if (this.plugin.settings.lastSyncFailed) {
        this.plugin.showInfoStatus(
          containerEl.find('.wc-setting-sync .wc-info-container').parentElement,
          'Last sync failed',
          'wc-error'
        )
      }
    } else {
      clientId = this.plugin.resetObsidianClientID()
      new Setting(containerEl)
        .setName('Connect Obsidian to WuCai')
        .setClass('wc-setting-connect')
        .setDesc('The WuCai plugin enables automatic syncing of all your highlights. Note: Requires WuCai account.')
        .addButton((button) => {
          button
            .setButtonText('Connect')
            .setCta()
            .onClick(async (evt) => {
              const success = await this.plugin.getUserAuthToken(evt.target as HTMLElement)
              if (success) {
                this.display()
              }
            })
        })
      let el = containerEl.createEl('div', { cls: 'wc-info-container' })
      containerEl.find('.wc-setting-connect > .setting-item-control ').prepend(el)
    }
    new Setting(containerEl)
      .setName('WuCai Client ID')
      .setDesc('This is your WuCai client id')
      .addTextArea((text) => {
        text.inputEl.rows = 2
        text.inputEl.cols = 24
        text.setValue(clientId)
      })
    const help = containerEl.createEl('p')
    help.innerHTML =
      "Question? Please see our <a href='https://www.dotalk.cn/s/M7'>feedback</a> or view <a href='https://www.dotalk.cn/s/KH'>changelog</a></b>"
  }
}
