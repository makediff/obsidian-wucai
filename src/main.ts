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

const WRITE_STYLE_OVERWRITE = 1
const WRITE_STYLE_APPEND = 2

// define our initial settings
const DEFAULT_SETTINGS: WuCaiPluginSettings = {
  token: '',
  wuCaiDir: 'WuCai',
  frequency: '0', // 0代表默认手动同步
  triggerOnLoad: true,
  isSyncing: false,
  lastSyncFailed: false,
  refreshNotes: false,
  notesToRefresh: [], // 待更新文件列表
  reimportShowConfirmation: true,
  lastCursor: '',
  dataVersion: 0,
  exportConfig: {
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

  // 对接口返回的内容进行检查
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
    this.clearSettingsAfterRun()
    this.settings.lastSyncFailed = true
    this.saveSettings()
    if (buttonContext) {
      this.showInfoStatus(buttonContext.buttonEl.parentElement, msg, 'wc-error')
      buttonContext.buttonEl.setText(localize('Run sync'))
    } else {
      this.notice(msg, true, 4, true)
    }
  }

  clearSettingsAfterRun() {
    this.settings.isSyncing = false
  }

  handleSyncSuccess(buttonContext: ButtonComponent, msg: string = 'Synced', lastCursor: string = '') {
    this.clearSettingsAfterRun()
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
    return fetch(BGCONSTS.BASE_URL + url, {
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
      // 如果文件夹被删除，则重新同步
      this.settings.lastCursor = ''
      this.settings.notesToRefresh = []
    }
    logger({ msg: 'onload last cursor', lastCursor: this.settings.lastCursor, flagx, isDirDeleted })
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
      return
    }

    let data2 = await rsp.json()
    if (this.checkResponseBody(buttonContext, data2)) {
      return
    }

    let initRet: ExportInitRequestResponse = data2['data'] || {}
    logger({ msg: 'in exportInit', initRet, lastCursor: this.settings.lastCursor, flagx })

    // 每次都使用最新的配置，并行重新预编译模板
    this.settings.exportConfig = initRet.exportConfig
    const compileErrMessage = this.pageTemplate.precompile(initRet.exportConfig.obTemplate)

    // 处理同步点位
    let tmpCursor = this.getLastCursor(initRet.lastCursor2, this.settings.lastCursor)
    if (tmpCursor) {
      this.settings.lastCursor = tmpCursor
    }

    await this.saveSettings()

    if ('SYNCED' === initRet.taskStatus) {
      this.handleSyncSuccess(buttonContext, 'Synced', this.settings.lastCursor)
      let msg = 'Latest WuCai sync already happened on your other device. Data should be up to date'
      this.notice(msg, false, 4, true)
    } else if ('EXPIRED' == initRet.taskStatus) {
      this.handleSyncError(buttonContext, 'sync service expried')
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
    if (WuCaiTemplates.isNeedRender(titleTpl)) {
      const titleTemplate = this.pageTemplate.getTitleTemplateByStr(titleTpl)
      filename = titleTemplate.render({
        title: WuCaiUtils.normalTitle(entry.title),
        createat_ts: entry.createAt,
      })
    } else {
      filename = titleTpl
    }

    // 设定在指定目录下，且添加笔记标识
    filename = `${this.settings.wuCaiDir}/${filename}-${entry.noteIdX}.md`

    const distFileName = normalizePath(filename).replace(/[\/ \s]+$/, '')
    if (!distFileName || distFileName.length <= 0) {
      return
    }

    const exportCfg = this.settings.exportConfig
    try {
      // const contents = await entry.getData(new zip.TextWriter())
      // 计算出笔记的最终路径和名字
      let dirPath = distFileName.substring(0, distFileName.lastIndexOf('/'))
      const fileInfo = await this.app.vault.getAbstractFileByPath(dirPath)
      if (!fileInfo || !(fileInfo instanceof TFolder)) {
        await this.app.vault.createFolder(dirPath)
      }
      const pageCtx: WuCaiPageContext = {
        title: entry.title,
        url: entry.url,
        wucaiurl: entry.wuCaiUrl || '',
        tags: WuCaiUtils.formatTags(entry.tags, exportCfg),
        pagenote: entry.pageNote,
        highlights: entry.highlights,
        createat: WuCaiUtils.formatTime(entry.createAt),
        createat_ts: entry.createAt,
        updateat: WuCaiUtils.formatTime(entry.updateAt),
        updateat_ts: entry.updateAt,
        noteid: entry.noteIdX,
        citekey: entry.citekey || '',
        author: entry.author || '',
      }
      const noteFile = await this.app.vault.getAbstractFileByPath(distFileName)
      const isNoteExists = noteFile && noteFile instanceof TFile
      if (!isNoteExists || WRITE_STYLE_OVERWRITE === exportCfg.writeStyle) {
        // 全量渲染整个页面里的所有内容
        const contents = WuCaiUtils.renderTemplate(pageCtx, this.pageTemplate)
        if (isNoteExists) {
          await this.app.vault.modify(noteFile, contents)
        } else {
          await this.app.vault.create(distFileName, contents)
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
      logger([`WuCai Official plugin: error writing ${distFileName}:`, e])
      this.notice(`WuCai: error while writing ${distFileName}: ${e}`, true, 4, true)
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
    logger({ msg: 'download', checkUpdate, flagx, lastCursor2 })
    try {
      response = await this.callApi(API_URL_DOWNLOAD, {
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
      return
    }

    // let blob = await response.blob()
    const data2 = await response.json()
    if (this.checkResponseBody(buttonContext, data2)) {
      return
    }

    const downloadRet: ExportDownloadResponse = data2['data']
    let entries: Array<NoteEntry> = downloadRet.notes || []

    // const blobReader = new zip.BlobReader(blob)
    // const zipReader = new zip.ZipReader(blobReader)
    // const entries = await zipReader.getEntries()

    // 不用提示了
    // this.notice('Saving files...', false, 30)

    // 是否为定向同步
    const isPartsDownload: boolean = noteIdXs.length > 0
    const entriesCount = entries.length

    // 预编译标题模板
    const exportCfg = this.settings.exportConfig
    let titleTpl: string = exportCfg.titleTemplate || 'wucai-{{ createat_ts | date("YYYY-MM-DD") }}'
    // 去掉标题里的换行
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
      // we got manual option
      return
    }
    this.scheduleInterval = window.setInterval(() => this.exportInit(null, true, 'schedule init'), milliseconds)
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
    logger(['started sync', this.settings.isSyncing])
    if (this.settings.isSyncing) {
      this.notice('WuCai sync already in progress', true)
      return
    }
    this.settings.isSyncing = true
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
    this.settings.isSyncing = false
    if (this.settings.token && this.settings.triggerOnLoad && !this.settings.isSyncing) {
      // 因为加载关系，如果目录没有创建，可能是ob还没有启动完成
      const dirInfo = this.app.vault.getAbstractFileByPath(this.settings.wuCaiDir)
      const isDirNotExists = !dirInfo || !(dirInfo instanceof TFolder)
      if (isDirNotExists) {
        this.app.workspace.onLayoutReady(() => {
          // https://forum.obsidian.md/t/plugins-with-a-lot-to-do-at-startup-being-async-onlayoutready/26205
          logger(['onload last cursor 1', this.settings.lastCursor])
          this.exportInit(null, true, 'onload + not exists')
        })
      } else {
        await this.exportInit(null, true, 'onload + exists 2')
        await this.refreshNoteExport() // 同步上次出错的网页
        logger(['onload last cursor 2', this.settings.lastCursor])
        // await this.exportInit(null, true, 'onload + exists')
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

  getObsidianClientID() {
    let tmpId = window.localStorage.getItem('wc-ObsidianClientId')
    if (tmpId) {
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
  }

  display(): void {
    let { containerEl } = this
    containerEl.empty()
    containerEl.createEl('h1', { text: 'WuCai Highlights Official' })
    containerEl
      .createEl('p', { text: 'Created by ' })
      .createEl('a', { text: '希果壳五彩插件', href: 'https://www.dotalk.cn/product/wucai' })
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
              if (this.plugin.settings.isSyncing) {
                new Notice('WuCai sync already in progress')
              } else {
                this.plugin.clearInfoStatus(containerEl)
                this.plugin.settings.isSyncing = true
                await this.plugin.saveData(this.plugin.settings)
                button.setButtonText('Syncing...')
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
          dropdown.addOption('60', 'Every 1 hour')
          dropdown.addOption((12 * 60).toString(), 'Every 12 hours')
          dropdown.addOption((24 * 60).toString(), 'Every 24 hours')

          // select the currently-saved option
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
      // 没有配置 token 的情况
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
    const help = containerEl.createEl('p')
    help.innerHTML = "Question? Please see our <a href='https://www.dotalk.cn/s/M7'>feedback</a> 🙂"
  }
}
