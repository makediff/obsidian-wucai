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

  // 处理原始模板文件，添加占位符
  static blocksRegExpMap = new Map<string, RegExp>([
    ['highlights', new RegExp('\\{%\\s*block\\s+highlights\\s*%\\}[\\s\\S]*?\\{%\\s*endblock\\s*%\\}', 'img')],
    ['pagenote', new RegExp('\\{%\\s*block\\s+pagenote\\s*%\\}[\\s\\S]*?\\{%\\s*endblock\\s*%\\}', 'img')],
  ])

  // 从目标文件提取占位符
  static holdersRegExpMap = new Map<string, RegExp>([
    ['highlights', new RegExp('%%\\s*begin\\s*highlights\\s*%%([\\s\\S]*?)%%\\s*end\\s+highlights\\s*%%', 'ig')],
    ['pagenote', new RegExp('%%\\s*begin\\s*pagenote\\s*%%([\\s\\S]*?)%%\\s*end\\s+pagenote\\s*%%', 'ig')],
  ])

  // 从 t1 模板里，找出需要的 block 和其对应的模板代码
  static getBlocks(t1: string): WuCaiBlocks {
    t1 = t1 || ''
    // let match1 = t1.matchAll(/(\{%\s*block\s+([a-z0-9-_]+)\s*%\}[\s\S]*?\{%\s*endblock\s*%\})/gi)
    let blockRegExp = new RegExp('\\{%\\s*block\\s+([a-z0-9-_]+)\\s*%\\}[\\s\\S]*?\\{%\\s*endblock\\s*%\\}', 'ig')
    let match1 = t1.matchAll(blockRegExp)
    let ret: WuCaiBlocks = {
      highlights: '',
      pagenote: '',
    }
    for (const match of match1) {
      let block = (match[1] || '').toLowerCase()
      switch (block) {
        case 'pagenote':
          if (ret.pagenote.length <= 0) {
            ret.pagenote = match[0] || ''
          }
          break
        case 'highlights':
          if (ret.highlights.length <= 0) {
            ret.highlights = match[0] || ''
          }
          break
        default:
          break
      }
    }
    return ret
  }

  // t1 is old file content
  // 处理目标文件
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
      let matchRet = t1.matchAll(exp)
      if (!matchRet || matchRet.length <= 0) {
        // append to the end of file
        t1 += wrapBlock(newCnt, bn)
        return
      }
      let matchC = 0
      for (const match1 of matchRet) {
        let oldCnt = match1[1] || ''
        if (writeStyle === 1) {
          // overwrite
          newCnt = '\n' + newCnt + '\n'
        } else {
          // append
          newCnt = oldCnt + '\n' + newCnt + '\n'
        }
        t1 = t1.replace(oldCnt, newCnt)
        matchC++
      }
      if (matchC <= 0) {
        t1 += wrapBlock(newCnt, bn)
      }
    })
    return t1
  }

  // 处理模板里的 block
  static replaceBlocks(t1: string, newBlocks: { [key: string]: string }): string {
    t1 = t1 || ''
    const bns = Object.keys(newBlocks || {})
    bns.forEach((bn) => {
      let exp = this.blocksRegExpMap.get(bn)
      if (!exp) {
        return
      }
      let newCnt = (newBlocks[bn] || '').replace(/(^[\r\n]+|[\r\n]+$)/g, '')
      if (!newCnt || newCnt.length <= 0) {
        return
      }
      // 因为是整个替换，且只用替换第一个，所以用 exec
      let match1 = exp.exec(t1)
      if (!match1) {
        return
      }
      let oldCnt = match1[0] || ''
      // console.log(['replace', oldCnt, newCnt, match1])
      t1 = t1.replace(oldCnt, newCnt)
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
  static formatTags(tags: Array<string>, exportCfg: WuCaiExportConfig): string {
    let ret = []
    tags = tags || []
    const isNeedHashTag = exportCfg.tagStyle === 1
    tags.forEach((tag) => {
      tag = tag.trim()
      if (!tag || tag.length <= 0) {
        return
      }
      let isHash = tag[0] === '#'
      let isInner = tag[0] === '['
      if (isHash && isNeedHashTag) {
        ret.push(tag)
      } else if (isInner && !isNeedHashTag) {
        ret.push(tag)
      } else {
        // 转换
        let coreTag = ''
        if (isHash) {
          coreTag = tag.substring(1)
        } else if (isInner) {
          coreTag = tag.substring(2, tag.length - 2).trim()
        }
        if (coreTag.length > 0) {
          if (isNeedHashTag) {
            ret.push('#' + coreTag)
          } else {
            ret.push(`[[${coreTag}]]`)
          }
        }
      }
    })
    if (exportCfg.haveWuCaiTag === 1) {
      if (isNeedHashTag) {
        ret.push('#五彩插件')
      } else {
        ret.push('[[五彩插件]]')
      }
    }
    return ret.join(" ")
  }

  static wrapBlock(cnt: string, name: string): string {
    return `\n%%begin ${name}%%\n${cnt}\n%%end ${name}%%\n`
  }

  // 生成的内容直接替换原有文件
  static renderTemplate(hodlers: WuCaiHolders, exportCfg: WuCaiExportConfig): string {
    let tpl = exportCfg.template || WuCaiTemplates.Style001

    // 对模板里的 block 添加占位符
    const blocks = this.getBlocks(tpl) // 优化，只需要1次
    let renderHolders: { [key: string]: string } = {}
    if (blocks.pagenote) {
      renderHolders['pagenote'] = this.wrapBlock(blocks.pagenote, 'pagenote')
    }
    if (blocks.highlights) {
      renderHolders['highlights'] = this.wrapBlock(blocks.highlights, 'highlights')
    }
    tpl = this.replaceBlocks(tpl, renderHolders)
    console.log(['new tpl is', tpl, renderHolders])
    return nunjucks.renderString(tpl, hodlers)
  }

  // 追加到文件末尾或替换文件里的局部内容
  static renderTemplateWithEditable(hodlers: WuCaiHolders, oldCnt: string, exportCfg: WuCaiExportConfig): string {
    const tpl = exportCfg.template || WuCaiTemplates.Style001
    // 1. 分析出模板里的 blocks
    const blocks = this.getBlocks(tpl) // 优化，只需要1次
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
