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
    highlights: new RegExp('(%%\\s*begin\\s+highlights\\s*%%([\\s\\S]*?)%%\\s*end\\s+highlights\\s*%%)', 'ig'),
    pagenote: new RegExp('(%%\\s*begin\\s+pagenote\\s*%%([\\s\\S]*?)%%\\s*end\\s+pagenote\\s*%%)', 'ig'),
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

  // 天数对比，如果updateat和createat不再同一天，则返回createat
  static getDiffDay(createat: number, updateat: number): number {
    if (updateat <= 0 || createat <= 0) {
      return 0
    }
    const day1 = this.formatDateTime(new Date(createat * 1000), 'YYYY-MM-DD')
    const day2 = this.formatDateTime(new Date(updateat * 1000), 'YYYY-MM-DD')
    if (day1 !== day2) {
      return updateat
    }
    return 0
  }

  // 23.6.8 https://docs.ansible.com/ansible/latest/reference_appendices/YAMLSyntax.html#gotchas
  static formatPageTitle(s: string): string {
    s = s || s
    if (s.length <= 0) {
      return s
    }
    return s.replace(/(:\s+)/g, ':')
  }

  // t1 is old file content
  // 处理目标文件
  // 基于占位符的局部更新策略
  static replaceHolders(t1: string, renderHolders: { [key: string]: string }): string {
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
        let blockLen = match1[1].length
        let suffixCnt = t1.substring(match1.index + blockLen)
        t1 = t1.substring(0, match1.index) + this.wrapBlockNoBreak(newCnt, bn) + suffixCnt
        matchC++
        break
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

  // 按换行符切割后去两边空行，合并空行
  static trimWithLine(coretxt: string): string {
    if (!coretxt || coretxt.length <= 0) {
      return ''
    }
    let arrCore = coretxt.split('\n')
    let arr2 = []
    if (arrCore.length > 1) {
      for (let i2 = 0; i2 < arrCore.length; i2++) {
        let _s2 = arrCore[i2]
          .replace(/[\s\t]+/, ' ')
          .replace(/[\r\n]+/g, '')
          .trim()
        if (_s2.length > 0) {
          arr2.push(_s2)
        }
      }
      coretxt = arr2.join('\n')
    } else {
      coretxt = coretxt.trim()
    }
    return coretxt
  }

  static normalTitle(title: string): string {
    title = title || ''
    title = title.replace(/[\s\t\n]+/g, ' ')
    // https://blog.csdn.net/xiejx618/article/details/17471819
    // \ / : * ? " < > |
    // 23.5.31 修复短横线需要转移问题
    title = title.replace(/[\~\\、\/\*"'<>%\$#&;；{}()=+\-:?？。，！!（）\|]/g, '')
    if (title.length <= 0) {
      return 'No title'
    }
    return title
  }

  static isWhiteSpaceForTagParser(c: number) {
    if (65292 == c || 12290 == c || 65307 == c || 65311 == c) {
      return true
    }
    return (
      10 == c ||
      13 == c ||
      (32 <= c && c <= 34) ||
      (36 <= c && c <= 44) ||
      46 == c ||
      (58 <= c && c <= 63) ||
      59 == c ||
      64 == c ||
      (91 <= c && c <= 94) ||
      (123 <= c && c <= 126) ||
      65292 == c
    )
  }

  static convertHashTagToBackLink(cnt: string): string {
    cnt = cnt || ''
    if (cnt.length <= 0) {
      return cnt
    }
    if (cnt.indexOf('#') < 0) {
      return cnt
    }
    const cntLength = cnt.length
    let left = -1
    const lastL = cntLength - 1
    const tagsPosi = []
    for (let i = 0; i < cntLength; i++) {
      const cCode = cnt.charCodeAt(i)
      const isLast = i == lastL
      const isWhiteS = this.isWhiteSpaceForTagParser(cCode)
      const il = i - left
      if (35 === cCode) {
        if (left > -1 && il > 1) {
          tagsPosi.push([left, i])
        }
        left = i
      } else if (left > -1 && (isWhiteS || isLast) && il >= 1) {
        if (isLast && !isWhiteS && il >= 1) {
          tagsPosi.push([left, i + 1])
        } else if (il > 1) {
          tagsPosi.push([left, i])
        }
        left = -1
      }
    }
    if (tagsPosi.length <= 0) {
      return cnt
    }
    const ret = []
    let offsetStart = 0
    for (const posi of tagsPosi) {
      const s = posi[0]
      const e = posi[1]
      if (s - offsetStart > 0) {
        ret.push(cnt.substring(offsetStart, s))
      }
      ret.push('[[' + cnt.substring(s + 1, e) + ']]')
      offsetStart = e
    }
    if (offsetStart > 0 && offsetStart < cnt.length) {
      ret.push(cnt.substring(offsetStart, cnt.length))
    }
    return ret.join('')
  }

  // // 处理老的配置是基于数值而非模板
  // static getTitleTemplateByStyle(titleFormat: number): string {
  //   let titleTpl = ''
  //   // 将老版本的配置参数转换成新的
  //   if (1 === titleFormat) {
  //     // 2023/01/wucai-网页标题-X.md
  //     titleTpl = `{{ createat_ts | date("YYYY/MM") }}/wucai-{{title}}`
  //   } else if (2 === titleFormat) {
  //     // 2023/01/wucai-20230102-X.md
  //     titleTpl = `{{ createat_ts | date("YYYY/MM") }}/wucai-{{ createat_ts | date("YYYY-MM-DD") }}`
  //   } else if (4 === titleFormat) {
  //     // only title
  //     titleTpl = `wucai-{{title}}`
  //   } else {
  //     // 使用时间戳，没有目录结构
  //     titleTpl = 'wucai-{{ createat_ts | date("YYYY-MM-DD") }}'
  //   }
  //   return titleTpl
  // }

  // // 生成目标文件名，用于格式 1~4
  // static generateFileName(titleFormat: number, { title = '', createAt = 0, noteIdX = '' }): string {
  //   let fn = ''
  //   let ts = new Date(createAt * 1000)
  //   if (1 === titleFormat) {
  //     // 使用标题
  //     title = this.normalTitle(title)
  //     fn = this.formatDateTime(ts, 'YYYY/MM') + '/wucai-' + title
  //   } else if (2 === titleFormat) {
  //     // 使用时间戳，有目录结构
  //     fn = this.formatDateTime(ts, 'YYYY/MM') + '/wucai-' + this.formatDateTime(ts, 'YYYY-MM-DD')
  //   } else if (4 === titleFormat) {
  //     // only title
  //     // title = this.normalTitle(title)
  //     fn = 'wucai-' + title
  //   } else {
  //     // title style is 3
  //     // 使用时间戳，没有目录结构
  //     fn = 'wucai-' + this.formatDateTime(ts, 'YYYY-MM-DD')
  //   }
  //   return `WuCai/${fn}-${noteIdX}.md`
  // }

  // 通过时间（秒）获得一个默认的时间格式
  static formatTime(ts: number): string {
    let d1 = new Date(ts * 1000)
    return this.formatDateTime(d1, 'YYYY-MM-DD HH:mm')
  }

  static formatPageNote(note: string, isHashTag: boolean): string {
    if (isHashTag) {
      return note || ''
    }
    return this.convertHashTagToBackLink(note) || ''
  }

  static formatHighlights(highlights: Array<HighlightInfo>, exportCfg: WuCaiExportConfig): Array<HighlightInfo> {
    const isHashTag = exportCfg.tagStyle === 1
    if (isHashTag || !highlights || highlights.length <= 0) {
      return highlights
    }
    for (let i = 0; i < highlights.length; i++) {
      const highlight = highlights[i]
      if (highlight && highlight.annonation && highlight.annonation.length > 0) {
        highlight.annonation = this.convertHashTagToBackLink(highlight.annonation)
      }
    }
    return highlights
  }

  // 根据配置生成 tag 列表
  static formatTags(tags: Array<string>, isHashTag: boolean): string {
    let ret: Array<string> = []
    tags = tags || []
    tags.forEach((tag) => {
      tag = tag.trim()
      if (!tag || tag.length <= 0) {
        return
      }
      let isHash = tag[0] === '#'
      let isInner = tag[0] === '['
      if (isHash && isHashTag) {
        ret.push(tag)
      } else if (isInner && !isHashTag) {
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
          if (isHashTag) {
            ret.push('#' + coreTag)
          } else {
            ret.push(`[[${coreTag}]]`)
          }
        }
      }
    })
    return ret.join(' ')
  }

  static wrapBlock(cnt: string, name: string, gap: string = '\n'): string {
    return `\n%%begin ${name}%%\n${cnt}\n%%end ${name}%%\n`
  }

  static wrapBlockNoBreak(cnt: string, name: string): string {
    return `%%begin ${name}%%\n${cnt}\n%%end ${name}%%`
  }

  // 生成的内容直接替换原有文件
  static renderTemplate(holders: WuCaiPageContext, wucaiTemplate: WuCaiTemplates): string {
    return wucaiTemplate.pageEngine.render(holders)
  }

  // 追加到文件末尾或替换文件里的局部内容
  static renderTemplateWithEditable(pageCtx: WuCaiPageContext, oldCnt: string, wucaiTemplate: WuCaiTemplates): string {
    // 1) 局部渲染
    let renderHolders: { [key: string]: string } = {}
    if (wucaiTemplate.blocks.pagenote) {
      let pageNote = wucaiTemplate.pagenoteEngine.render(pageCtx)
      if (pageNote) {
        renderHolders['pagenote'] = pageNote
      }
    }
    if (wucaiTemplate.blocks.highlights) {
      let lights = wucaiTemplate.highlightsEngine.render(pageCtx)
      if (lights) {
        renderHolders['highlights'] = lights
      }
    }
    // 2) 将 block 结果追加到指定占位符
    return this.replaceHolders(oldCnt, renderHolders)
  }

  static getDirFromPath(p: string) {
    if (!p) {
      return ''
    }
    const idx = p.lastIndexOf('/')
    if (idx <= 0) {
      return ''
    }
    return p.substring(0, idx)
  }

  // 返回一个连接的 domain
  static getDomainByUrl(s: string): string {
    if (!s) {
      return ''
    }
    let ux = new URL(s)
    if (!ux) {
      return ''
    }
    return ux.hostname.toLocaleLowerCase()
  }

  static getDomain2ByDomain(urlDomain: string): string {
    if (!urlDomain || urlDomain.length <= 0) {
      return ''
    }
    let hostArr = urlDomain.split('.')
    const hostLen = hostArr.length
    if (hostLen <= 2) {
      return urlDomain
    }
    return `${hostArr[hostLen - 2]}.${hostArr[hostLen - 1]}`
  }

  static detectIsMardownFormat(s: string): boolean {
    // 检测是否是 markdown 里的某些格式，比如 todo, list， tag， backlink, 这些需要保留原来的格式
    if (!s || s.length <= 0) {
      return false
    }
    // is a todo item, and not contains new line
    if (/^- \[[ x]\] +/.test(s) && s.indexOf('\n') < 0) {
      return true
    }
    // is a block
    if (/^\`\`\`/.test(s) && /\`\`\`\s*$/.test(s)) {
      return true
    }
    return false
  }
}
