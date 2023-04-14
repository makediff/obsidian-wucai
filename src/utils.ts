import { WuCaiTemplates } from './templates'
import moment from 'moment'
import nunjucks from 'nunjucks'

export class WuCaiUtils {
  static allowedBlock = ['highlights', 'pagenote']

  // 用于从模板里提取指定 block 模板内容
  static fetchBlocksRegExp = new RegExp(
    '(\\{%\\s*block\\s+([a-z0-9-_]+)\\s*%}[\\s\\S]*?\\{%\\s*endblock\\s*%\\})',
    'ig'
  )

  // 目标文件占位符提取
  static holdersRegExpMap = new Map<string, RegExp>([
    ['highlights', new RegExp('(%%\\s*begin\\s*highlights\\s*%%([\\s\\S]*?)%%\\s*end\\s+highlights\\s*%%)', 'ig')],
    ['pagenote', new RegExp('(%%\\s*begin\\s*pagenote\\s*%%([\\s\\S]*?)%%\\s*end\\s+pagenote\\s*%%)', 'ig')],
  ])

  // 从 t1 模板里，找出需要的 block 和其对应的模板代码
  static getBlocks(t1: string): WuCaiBlocks {
    t1 = t1 || ''
    let match1 = t1.matchAll(/(\{%\s*block\s+([a-z0-9-_]+)\s*%\}[\s\S]*?\{%\s*endblock\s*%\})/gi)
    let ret: WuCaiBlocks = {
      highlights: '',
      pagenote: '',
    }
    for (const match of match1) {
      let block = (match[2] || '').toLowerCase()
      switch (block) {
        case 'pagenote':
          ret.pagenote = match[1] || ''
          break
        case 'highlights':
          ret.highlights = match[1] || ''
          break
        default:
          break
      }
    }
    return ret
  }

  // t1 is old file content
  static replaceHolders(t1: string, renderHolders: { [key: string]: string }, writeStyle: number = 1): string {
    t1 = t1 || ''
    const bns = Object.keys(renderHolders || {})
    bns.forEach((bn) => {
      let exp = this.holdersRegExpMap.get(bn)
      if (!exp) {
        return
      }
      let newCnt = (renderHolders[bn] || '').replace(/(^[\r\n]+|[\r\n]+$)/g, '')
      if (!newCnt || newCnt.length <= 0) {
        return
      }
      let match1 = t1.match(exp)
      if (!match1) {
        // append to the end of file
        t1 += `\n%%begin ${bn}%%\n${newCnt}\n%%end ${bn}%%\n`
        return t1
      }
      for (const match of match1) {
        let oldCnt = match[2] || ''
        if (writeStyle === 1) {
          // overwrite
          newCnt = '\n' + newCnt + '\n'
        } else {
          // append
          newCnt = oldCnt + '\n' + newCnt + '\n'
        }
        t1 = t1.replace(oldCnt, newCnt)
      }
    })
    return t1
  }

  static formatDateTime(date: any, format = 'YYYY-MM-DD HH:mm'): string {
    if (!date) {
      return ''
    }
    // http://momentjs.cn/docs/use-it/typescript.html
    // https://momentjs.com/
    return moment(date).format(format)
  }

  // 生成目标文件名
  static generateFileName(nameStyle: number, { title = '', createAt = 0, noteIdX = '' }): string {
    return `WuCai/${noteIdX}.md`
  }

  // 根据配置生成 tag 列表
  static formatTags(tags: string, exportCfg: WuCaiExportConfig): string {
    return ''
  }

  // 生成的内容直接替换原有文件
  static renderTemplate(hodlers: WuCaiHolders, exportCfg: WuCaiExportConfig): string {
    let tpl = exportCfg.template || WuCaiTemplates.Style001
    return nunjucks.renderString(tpl, hodlers)
  }

  // 追加到文件末尾或替换文件里的局部内容
  static renderTemplateWithEditable(hodlers: WuCaiHolders, oldCnt: string, exportCfg: WuCaiExportConfig): string {
    let tpl = exportCfg.template || WuCaiTemplates.Style001
    // 1. 分析出模板里的 blocks
    let blocks = this.getBlocks(tpl)
    console.log(['render blocks', blocks])
    // 2. 用数据渲染此 block 的结果
    let renderHolders: { [key: string]: string } = {}
    if (blocks.pagenote) {
      renderHolders['pagenote'] = nunjucks.renderString(blocks.pagenote, hodlers)
    }
    if (blocks.highlights) {
      renderHolders['highlights'] = nunjucks.renderString(blocks.highlights, hodlers)
    }
    console.log(['render holders', renderHolders])
    // 3. 将 block 结果替换到文件里
    return this.replaceHolders(oldCnt, renderHolders, exportCfg.writeStyle)
  }
}
