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

// the process.env variable will be replaced by its target value in the output main.js file
const baseURL = process.env.WUCAI_SERVER_URL || 'https://marker.dotalk.cn'
const WAITING_STATUSES = ['PENDING', 'RECEIVED', 'STARTED', 'RETRY']
const SUCCESS_STATUSES = ['SYNCING']
const API_URL_INIT = '/apix/openapi/wucai/sync/init'
const API_URL_DOWNLOAD = '/apix/openapi/wucai/sync/download'

interface WuCaiAuthResponse {
  accessToken: string
}

interface ExportRequestResponse {
  latestId: number
  totalNotes: number
  notesExported: number
  taskStatus: string
}

interface ExportStatusResponse {
  totalNotes: number
  notesExported: number
  taskStatus: string
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
  lastSavedExportID: number
  currentSyncExportID: number
  refreshNotes: boolean
  notesToRefresh: Array<string>
  notesPathIdsMap: { [key: string]: string } // key is path(also filename), value is noteId, ==> path vs. noteId
  notesIdsPathMap: { [key: string]: NoteIdInfo } // key is nodeId, value is path
  // renameNotes: { [key: string]: number } // renamed note Ids, key is noteId, value is always 1
  reimportShowConfirmation: boolean
}

// define our initial settings
const DEFAULT_SETTINGS: WuCaiPluginSettings = {
  token: '',
  wuCaiDir: 'WuCai',
  frequency: '0', // 0代表默认手动同步
  triggerOnLoad: true,
  isSyncing: false,
  lastSyncFailed: false,
  lastSavedExportID: 0, // 最后同步成功的位置
  currentSyncExportID: 0,
  refreshNotes: false,
  notesToRefresh: [],
  notesPathIdsMap: {},
  notesIdsPathMap: {},
  reimportShowConfirmation: true,
}

const localizeData = {
  /**
   * Run sync
   * Synced
   * Run sync
   * Exporting WuCai data
   * Building export...
   * sync service expried
   * Sync failed
   * need advanced permission
   */
  CN: {
    'call api failed': '',
    "Can't connect to server": '',
  },
}

function logger(msg: any) {
  BGCONSTS.PRINT_LOG && console.log(msg)
}

function localize(msg: string): string {
  return msg
}

export default class WuCaiPlugin extends Plugin {
  settings: WuCaiPluginSettings
  vaultfs: Vault
  scheduleInterval: null | number = null
  statusBar: StatusBar

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
    this.settings.currentSyncExportID = 0
  }

  handleSyncSuccess(buttonContext: ButtonComponent, msg: string = 'Synced', exportID: number = null) {
    this.clearSettingsAfterRun()
    this.settings.lastSyncFailed = false
    this.settings.currentSyncExportID = 0
    if (exportID && exportID > this.settings.lastSavedExportID) {
      this.settings.lastSavedExportID = exportID
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
    return fetch(baseURL + url, {
      headers: { ...this.getAuthHeaders(), 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify(params),
    })
  }

  // 初始化同步
  async exportInit(buttonContext?: ButtonComponent, auto?: boolean) {
    const dirInfo = this.app.vault.getAbstractFileByPath(this.settings.wuCaiDir)
    const noteDirDeleted = !dirInfo || !(dirInfo instanceof TFolder)
    let exportId: number
    if (noteDirDeleted) {
      // 如果文件夹被删除，代表是重新同步
      exportId = 0
      this.settings.lastSavedExportID = 0
      this.settings.currentSyncExportID = 0
    } else {
      exportId = this.settings.lastSavedExportID || this.settings.currentSyncExportID || 0
    }
    let params = { noteDirDeleted, exportId, auto: auto && true }
    let rsp
    try {
      rsp = await this.callApi(API_URL_INIT, params)
    } catch (e) {
      logger(['WuCai Official plugin: fetch failed in exportInit: ', e])
    }
    if (!rsp || !rsp.ok) {
      logger(['WuCai Official plugin: bad response in exportInit: ', rsp])
      this.handleSyncError(buttonContext, this.getErrorMessageFromResponse(rsp))
      return
    }

    let data2 = await rsp.json()
    if (this.checkResponseBody(buttonContext, data2)) {
      return
    }

    let data: ExportRequestResponse = data2['data'] || {}
    logger(['in exportInit', data, this.settings.lastSavedExportID, this.settings.currentSyncExportID])
    // 通过服务端计算来确定当前需要从哪个id开始同步笔记
    this.settings.currentSyncExportID = data.latestId
    await this.saveSettings()

    if ('SYNCED' === data.taskStatus) {
      this.handleSyncSuccess(buttonContext, 'Synced', data.latestId)
      let msg = 'Latest WuCai sync already happened on your other device. Data should be up to date'
      this.notice(msg, false, 4, true)
    } else if ('EXPIRED' == data.taskStatus) {
      this.handleSyncError(buttonContext, 'sync service expried')
    } else if (WAITING_STATUSES.includes(data.taskStatus)) {
      if (data.notesExported > 0) {
        const progressMsg = localize('Exporting WuCai data') + ` (${data.notesExported} / ${data.totalNotes}) ...`
        this.notice(progressMsg)
      } else {
        this.notice('Building export...')
      }
      // re-try in 3 second
      await new Promise((resolve) => setTimeout(resolve, 3000))
      await this.exportInit(buttonContext)
    } else if (SUCCESS_STATUSES.includes(data.taskStatus)) {
      this.notice('Syncing WuCai data')
      return this.downloadArchive(data.latestId, [], buttonContext, false)
    } else {
      this.handleSyncError(buttonContext, 'Sync failed,' + data.taskStatus)
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
    return {
      AUTHORIZATION: `Token ${this.settings.token}`,
      'Obsidian-Client': `${this.getObsidianClientID()}`,
    }
  }

  // 是否有对应的本地名称（出现这样的情况是本地做了重命名或移动文件夹)
  findLocalFileNameByNoteId(noteID: string): string {
    let note: NoteIdInfo = this.settings.notesIdsPathMap[noteID]
    if (!note || note == undefined) {
      return ''
    }
    let newfn = note.path
    if (newfn.startsWith(this.settings.wuCaiDir + '/')) {
      // 只有在指定的文件夹内移动才会保持关联
      return newfn
    }
    return ''
  }

  // 指定范围或指定笔记进行同步
  async downloadArchive(
    exportID: number,
    noteIds: Array<number>,
    buttonContext: ButtonComponent,
    isOverwrite: boolean
  ): Promise<void> {
    let response
    try {
      // 同步范围: exportID ~ maxExportId, or noteIds
      response = await this.callApi(API_URL_DOWNLOAD, { exportID, noteIds })
    } catch (e) {
      logger(['WuCai Official plugin: fetch failed in downloadArchive: ', e])
    }
    if (!response || !response.ok) {
      logger(['WuCai Official plugin: bad response in downloadArchive: ', response])
      this.handleSyncError(buttonContext, this.getErrorMessageFromResponse(response))
      return
    }

    // let blob = await response.blob()
    let data2 = await response.json()
    if (this.checkResponseBody(buttonContext, data2)) {
      return
    }

    let entries = data2['data']['entries'] || []
    this.vaultfs = this.app.vault

    // const blobReader = new zip.BlobReader(blob)
    // const zipReader = new zip.ZipReader(blobReader)
    // const entries = await zipReader.getEntries()
    this.notice('Saving files...', false, 30)
    const isPartsDownloadLogic: boolean = noteIds.length > 0
    let entriesCount = entries.length
    if (entriesCount > 0) {
      for (const entry of entries) {
        let noteId: string
        const processedFileName = normalizePath(entry.filename.replace(/^WuCai/, this.settings.wuCaiDir))
        try {
          // const contents = await entry.getData(new zip.TextWriter())
          const contents = entry.contents
          noteId = '' + entry.noteId

          // 计算出笔记的最终路径和名字
          let originalName = this.findLocalFileNameByNoteId(noteId) || processedFileName
          originalName = originalName.replace(/\/*$/, '')

          logger(['sync note', originalName, processedFileName])
          let dirPath = originalName.substring(0, originalName.lastIndexOf('/'))
          const fileInfo = await this.vaultfs.getAbstractFileByPath(dirPath)
          if (!fileInfo || !(fileInfo instanceof TFolder)) {
            await this.vaultfs.createFolder(dirPath)
          }

          this.settings.notesPathIdsMap[originalName] = noteId
          this.settings.notesIdsPathMap[noteId] = { path: originalName, updateAt: entry.updateAt }

          const originalFile = await this.vaultfs.getAbstractFileByPath(originalName)
          if (!originalFile || !(originalFile instanceof TFile)) {
            await this.vaultfs.create(originalName, contents)
          } else {
            if (isOverwrite) {
              await this.vaultfs.modify(originalFile, contents)
            } else {
              // 如果本地文件已经存在，且不允许覆盖的时候，追加新的内容到文件末尾
              const oldCnt = await this.vaultfs.read(originalFile)
              if (oldCnt !== contents) {
                await this.vaultfs.append(originalFile, '\n' + contents)
              }
            }
          }
          await this.saveSettings()

          // 在同步的过程中不断的更新同步位置
          if (!isPartsDownloadLogic && entry.exportID && entry.exportID > exportID) {
            exportID = entry.exportID
            if (exportID > this.settings.lastSavedExportID) {
              this.settings.lastSavedExportID = exportID
            }
          }
        } catch (e) {
          logger([`WuCai Official plugin: error writing ${processedFileName}:`, e])
          this.notice(`WuCai: error while writing ${processedFileName}: ${e}`, true, 4, true)
          if (noteId) {
            this.settings.notesToRefresh.push(noteId)
            await this.saveSettings()
          }
        }
      }
    }
    // close the ZipReader
    // await zipReader.close()
    let isCompleted = false
    if (isPartsDownloadLogic) {
      // 当前是指定笔记进行同步，所以每次就代表是一组同步完成
      isCompleted = true
    } else {
      // 当前是通过偏移量范围进行同步
      isCompleted = entriesCount <= 0
    }
    if (isCompleted) {
      await this.acknowledgeSyncCompleted(buttonContext)
      this.handleSyncSuccess(buttonContext, 'Synced!', exportID)
      this.notice('WuCai sync completed', true, 1, true)
      // @ts-ignore
      if (Platform.isMobileApp) {
        this.notice("If you don't see all of your WuCai files reload obsidian app", true)
      }
    } else if (BGCONSTS.IS_DEBUG) {
      await this.acknowledgeSyncCompleted(buttonContext)
      this.handleSyncSuccess(buttonContext, 'Synced! debug mode', exportID)
      this.notice('WuCai sync completed, in debug mode', true, 1, true)
    } else if (!BGCONSTS.IS_DEBUG) {
      this.handleSyncSuccess(buttonContext, 'syncing', exportID)
      this.notice('WuCai is syncing, ' + exportID, true, 1, true)
      await new Promise((resolve) => setTimeout(resolve, 5000))
      this.downloadArchive(exportID, [], buttonContext, isOverwrite)
    }
  }

  async acknowledgeSyncCompleted(buttonContext: ButtonComponent) {
    let rsp
    let url = '/apix/openapi/wucai/sync/ack'
    try {
      let params = { lastSavedExportID: this.settings.lastSavedExportID }
      rsp = await this.callApi(url, params)
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
    this.scheduleInterval = window.setInterval(() => this.exportInit(null, true), milliseconds)
    this.registerInterval(this.scheduleInterval)
  }

  async refreshNoteExport() {
    let noteIds = this.settings.notesToRefresh || []
    if (!noteIds.length || !this.settings.refreshNotes) {
      return
    }
    let newNoteIds: Array<number> = []
    for (let i = 0; i < noteIds.length; i++) {
      newNoteIds.push(parseInt(noteIds[i]))
      if (i >= 5) {
        break
      }
    }
    this.downloadArchive(0, newNoteIds, null, false)
    this.settings.notesToRefresh = this.settings.notesToRefresh.filter((n) => !newNoteIds.includes(parseInt(n)))
  }

  async addNoteToRefresh(noteId: string) {
    this.settings.notesToRefresh.push(noteId)
    await this.saveSettings()
  }

  reimportFile(vault: Vault, fileName: string, isOverwrite: boolean = false) {
    const noteId = this.settings.notesPathIdsMap[fileName]
    if (!noteId) {
      this.notice('Failed to reimport. note id not found', true)
      return
    }
    this.downloadArchive(0, [parseInt(noteId)], null, isOverwrite)
  }

  startSync() {
    logger(['started sync', this.settings.isSyncing])
    if (this.settings.isSyncing) {
      this.notice('WuCai sync already in progress', true)
    } else {
      this.settings.isSyncing = true
      this.saveSettings()
      this.exportInit()
    }
  }

  async onload() {
    // @ts-ignore
    if (!Platform.isMobileApp) {
      this.statusBar = new StatusBar(this.addStatusBarItem())
      this.registerInterval(window.setInterval(() => this.statusBar.display(), 1000))
    }
    await this.loadSettings()
    this.refreshNoteExport()
    this.app.vault.on('delete', async (file) => {
      // 将删除的文件放到待更新列表，这样下次就可以重新同步删除的问题
      const noteID = this.settings.notesPathIdsMap[file.path]
      if (noteID) {
        await this.addNoteToRefresh(noteID)
      }
      delete this.settings.notesPathIdsMap[file.path]
      delete this.settings.notesIdsPathMap[noteID]
      this.saveSettings()
      if (noteID) {
        this.refreshNoteExport()
      }
    })
    this.app.vault.on('rename', (file, oldPath) => {
      // 如果是五彩划线目录里的文件，在重命名的时候，进行关联，以保证下次同步能找到相应的文件
      if (!oldPath.startsWith(this.settings.wuCaiDir + '/')) {
        return
      }
      logger(['rename path', file, oldPath])
      const noteID = this.settings.notesPathIdsMap[oldPath]
      if (!noteID) {
        // 检测是否是修改的目录，如果是目录，则需要更新目录下的所有映射关系
        let oldPathLength = oldPath.length
        for (let tmpNoteId in this.settings.notesIdsPathMap) {
          let note: NoteIdInfo = this.settings.notesIdsPathMap[tmpNoteId]
          if (!note || note == undefined) {
            continue
          }
          let tmpOldPath = note.path
          if (tmpOldPath.startsWith(oldPath + '/')) {
            // 更新此文件夹下面的文件映射关系
            let tmpNewPath = file.path + tmpOldPath.substring(oldPathLength)
            logger(['rename map, ', oldPath, tmpOldPath, tmpNewPath])
            delete this.settings.notesPathIdsMap[tmpOldPath]
            this.settings.notesPathIdsMap[tmpNewPath] = tmpNoteId
            this.settings.notesIdsPathMap[tmpNoteId].path = tmpNewPath
          }
        }
        return
      }
      this.settings.notesPathIdsMap[file.path] = noteID
      this.settings.notesIdsPathMap[noteID].path = file.path
      delete this.settings.notesPathIdsMap[oldPath]
      this.saveSettings()
    })
    if (this.settings.isSyncing) {
      if (this.settings.currentSyncExportID) {
        await this.exportInit()
      } else {
        this.settings.isSyncing = false
        await this.saveSettings()
      }
    }
    this.addCommand({
      id: 'sync',
      name: 'Sync your data now',
      callback: () => {
        this.startSync()
      },
    })
    // this.addCommand({
    //   id: 'wucai-official-format',
    //   name: 'Customize formatting',
    //   callback: () => window.open(`${baseURL}/export/obsidian/preferences`),
    // })
    this.addCommand({
      id: 'reimport',
      name: 'Delete and reimport this document',
      editorCheckCallback: (checking: boolean, editor: Editor, view: MarkdownView) => {
        const activeFilePath = view.file.path
        const isRWfile = activeFilePath in this.settings.notesPathIdsMap
        if (checking) {
          return isRWfile
        }
        if (this.settings.reimportShowConfirmation) {
          const modal = new Modal(view.app)
          modal.contentEl.createEl('p', {
            text:
              'Warning: Proceeding will delete this file entirely (including any changes you made) ' +
              'and then reimport a new copy of your highlights from WuCai.',
          })
          const buttonsContainer = modal.contentEl.createEl('div', { cls: 'wc-modal-btns' })
          const cancelBtn = buttonsContainer.createEl('button', { text: 'Cancel' })
          const confirmBtn = buttonsContainer.createEl('button', { text: 'Proceed', cls: 'mod-warning' })
          const showConfContainer = modal.contentEl.createEl('div', { cls: 'wc-modal-confirmation' })
          showConfContainer.createEl('label', { attr: { for: 'wc-ask-nl' }, text: "on't ask me in the future" })
          const showConf = showConfContainer.createEl('input', { type: 'checkbox', attr: { name: 'wc-ask-nl' } })
          showConf.addEventListener('change', (ev) => {
            // @ts-ignore
            this.settings.reimportShowConfirmation = !ev.target.checked
            this.saveSettings()
          })
          cancelBtn.onClickEvent(() => {
            modal.close()
          })
          confirmBtn.onClickEvent(() => {
            this.reimportFile(view.app.vault, activeFilePath, true)
            modal.close()
          })
          modal.open()
        } else {
          this.reimportFile(view.app.vault, activeFilePath, true)
        }
      },
    })
    // this.registerMarkdownPostProcessor((el, ctx) => {
    //   if (!ctx.sourcePath.startsWith(this.settings.wuCaiDir)) {
    //     return
    //   }
    //   let matches: string[]
    //   try {
    //     // @ts-ignore
    //     matches = [...ctx.getSectionInfo(el).text.matchAll(/__(.+)__/g)].map((a) => a[1])
    //   } catch (TypeError) {
    //     // failed interaction with a Dataview element
    //     return
    //   }
    //   const hypers = el.findAll('strong').filter((e) => matches.contains(e.textContent))
    //   hypers.forEach((strongEl) => {
    //     const replacement = el.createEl('span')
    //     while (strongEl.firstChild) {
    //       replacement.appendChild(strongEl.firstChild)
    //     }
    //     replacement.addClass('wc-hyper-highlight')
    //     strongEl.replaceWith(replacement)
    //   })
    // })
    this.addSettingTab(new WuCaiSettingTab(this.app, this))
    await this.configureSchedule()
    if (this.settings.token && this.settings.triggerOnLoad && !this.settings.isSyncing) {
      await this.saveSettings()
      await this.exportInit(null, true)
    }
  }

  onunload() {
    // 暂时没有逻辑需要处理
    return
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
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
      window.open(`${baseURL}/page/gentoken/${BGCONSTS.SERVICE_ID}/${uuid}`)
    }
    let response
    try {
      let url = '/page/auth/openapi/gettoken'
      response = await this.callApi(url, { did: uuid })
    } catch (e) {
      logger(['WuCai Official plugin: fetch failed in getUserAuthToken: ', e])
    }
    if (!response || !response.ok) {
      logger(['WuCai Official plugin: bad response in getUserAuthToken: ', response])
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
        logger('WuCai Official plugin: reached attempt limit in getUserAuthToken')
        return
      }
      logger(`WuCai Official plugin: didn't get token data, retrying (attempt ${attempt + 1})`)
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
      .createEl('a', { text: '希果壳五彩', href: 'https://www.dotalk.cn/product/wucai' })
    containerEl.getElementsByTagName('p')[0].appendText(' 🚀🚀')
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
                // NOTE: This is used to prevent multiple syncs at the same time. However, if a previous sync fails,
                //  it can stop new syncs from happening. Make sure to set isSyncing to false
                //  if there's ever errors/failures in previous sync attempts, so that
                //  we don't block syncing subsequent times.
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
            window.open(`${baseURL}/page/plugins/obsidian/preferences`)
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
            // update the plugin settings
            this.plugin.settings.frequency = newValue
            this.plugin.saveSettings()

            // destroy & re-create the scheduled task
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
      new Setting(containerEl)
        .setName('Resync deleted files')
        .setDesc(
          'If enabled, you can refresh individual items by deleting the file in Obsidian and initiating a resync'
        )
        .addToggle((toggle) => {
          toggle.setValue(this.plugin.settings.refreshNotes)
          toggle.onChange(async (val) => {
            this.plugin.settings.refreshNotes = val
            await this.plugin.saveSettings()
            if (val) {
              this.plugin.refreshNoteExport()
            }
          })
        })

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
        .setDesc('The WuCai plugin enables automatic syncing of all your highlights . Note: Requires WuCai account.')
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
