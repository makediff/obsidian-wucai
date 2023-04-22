import { WuCaiTemplates } from './templates'
import moment from 'moment'

export class WuCaiUtils {
  static allowedBlock = ['highlights', 'pagenote']

  // 用于从模板里提取指定 block 模板内容
  static fetchBlocksRegExp = new RegExp(
    '\\{%\\s*block\\s+([a-z0-9-_]+)\\s*%\\}[\\s\\S]*?\\{%\\s*endblock\\s*%\\}',
    'ig'
  )

  // 处理原始模板文件，添加占位符
  static blocksRegExpMap: { [key: string]: RegExp } = {
    highlights: new RegExp('\\{%\\s*block\\s+highlights\\s*%\\}[\\s\\S]*?\\{%\\s*endblock\\s*%\\}', 'img'),
    pagenote: new RegExp('\\{%\\s*block\\s+pagenote\\s*%\\}[\\s\\S]*?\\{%\\s*endblock\\s*%\\}', 'img'),
  }

  // 从目标文件提取占位符
  static holdersRegExpMap: { [key: string]: RegExp } = {
    highlights: new RegExp('%%\\s*begin\\s*highlights\\s*%%([\\s\\S]*?)%%\\s*end\\s+highlights\\s*%%', 'ig'),
    pagenote: new RegExp('%%\\s*begin\\s*pagenote\\s*%%([\\s\\S]*?)%%\\s*end\\s+pagenote\\s*%%', 'ig'),
  }

  // 从 t1 模板里，找出需要的 block 和其对应的模板代码
  static getBlocks(t2: string): WuCaiBlocks {
    let t1 = t2 || ''
    let matchRet = t1.matchAll(this.fetchBlocksRegExp)
    let ret: WuCaiBlocks = {
      highlights: '',
      pagenote: '',
    }
    if (!matchRet) {
      // console.log({ msg: 'get blocks', t1, exp: this.fetchBlocksRegExp })
      return ret
    }
    for (const match of matchRet) {
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
      let exp = this.holdersRegExpMap[bn]
      if (!exp) {
        return
      }
      let newCnt = (renderHolders[bn] || '').replace(/(^[\r\n]+|[\r\n]+$)/g, '')
      if (!newCnt || newCnt.length <= 0) {
        return
      }
      let matchRet = t1.matchAll(exp)
      if (!matchRet) {
        // append to the end of file
        t1 += this.wrapBlock(newCnt, bn)
        return t1
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
        t1 += this.wrapBlock(newCnt, bn)
      }
    })
    return t1
  }

  // 处理模板里的 block
  static replaceBlocks(t1: string, newBlocks: { [key: string]: string }): string {
    t1 = t1 || ''
    const bns = Object.keys(newBlocks || {})
    bns.forEach((bn) => {
      let exp = this.blocksRegExpMap[bn]
      if (!exp) {
        return
      }
      let newCnt = (newBlocks[bn] || '').replace(/(^[\r\n]+|[\r\n]+$)/g, '')
      if (!newCnt || newCnt.length <= 0) {
        return
      }
      // 因为是整个替换，且只用替换第一个，所以用 exec
      // // 因为 exp 的 exec 是有状态的，所以需要重置 lastIndex
      // exp.lastIndex = 0
      let matchRet = t1.matchAll(exp)
      if (!matchRet) {
        return
      }
      for (const match1 of matchRet) {
        let oldCnt = match1[0] || ''
        // console.log(['replace', oldCnt, newCnt, match1])
        t1 = t1.replace(oldCnt, newCnt)
        break
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
  static generateFileName(titleStyle: number, { title = '', createAt = 0, noteIdX = '' }): string {
    let fn = ''
    let ts = new Date(createAt * 1000)
    if (1 === titleStyle) {
      // 使用标题
      title = title || ''
      title = title.replace(/[\s\t\n]+/g, ' ')
      // https://blog.csdn.net/xiejx618/article/details/17471819
      // \ / : * ? " < > |
      title = title.replace(/[?\\、\/\*"'<>%\$#!~&;；={}()~+-:。，！；（）？\|]/g, '')
      if (title.length <= 0) {
        title = 'No title'
      }
      fn = this.formatDateTime(ts, 'YYYY/MM') + '/wucai-' + title
    } else if (2 === titleStyle) {
      // 使用时间戳，有目录结构
      fn = this.formatDateTime(ts, 'YYYY/MM') + '/wucai-' + this.formatDateTime(ts, 'YYYY-MM-DD')
    } else {
      // 使用时间戳，没有目录结构
      fn = 'wucai-' + this.formatDateTime(ts, 'YYYY-MM-DD')
    }
    return `WuCai/${fn}-${noteIdX}.md`
  }

  static formatTime(ts: number): string {
    let d1 = new Date(ts * 1000)
    return this.formatDateTime(d1, 'YYYY-MM-DD HH:mm')
  }

  // 根据配置生成 tag 列表
  static formatTags(tags: Array<string>, exportCfg: WuCaiExportConfig): string {
    let ret: Array<string> = []
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
    return ret.join(' ')
  }

  static wrapBlock(cnt: string, name: string): string {
    return `\n%%begin ${name}%%\n${cnt}\n%%end ${name}%%\n`
  }

  // 生成的内容直接替换原有文件
  static renderTemplate(holders: WuCaiHolders, wucaiTemplate: WuCaiTemplates): string {
    return wucaiTemplate.pageEngine.render(holders)
  }

  // 追加到文件末尾或替换文件里的局部内容
  static renderTemplateWithEditable(
    holders: WuCaiHolders,
    oldCnt: string,
    wucaiTemplate: WuCaiTemplates,
    exportCfg: WuCaiExportConfig
  ): string {
    // 1) 局部渲染
    let renderHolders: { [key: string]: string } = {}
    if (wucaiTemplate.blocks.pagenote) {
      renderHolders['pagenote'] = wucaiTemplate.pagenoteEngine.render(holders)
    }
    if (wucaiTemplate.blocks.highlights) {
      renderHolders['highlights'] = wucaiTemplate.highlightsEngine.render(holders)
    }
    // 2) 将 block 结果替换到文件里
    return this.replaceHolders(oldCnt, renderHolders, exportCfg.writeStyle)
  }
}
