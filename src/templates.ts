import nunjucks from 'nunjucks'
import { WuCaiUtils } from './utils'

const strref = typeof 's'
export class WuCaiTemplates {
  static leftHolder = '{{'
  static rightHolder = '}}'

  templateEnv: nunjucks.Environment

  // 当前用户网页对应的渲染模板
  pageTemplateStr: string
  pageNoteTemplateStr: string
  highlightsTemplateStr: string

  // 从模板里提取的 block
  blocks: WuCaiBlocks

  // 提前编译好的 template
  pagenoteEngine: nunjucks.Template
  highlightsEngine: nunjucks.Template
  mdcontentEngine: nunjucks.Template
  pageEngine: nunjucks.Template

  cachedTitleTemplates: { [key: string]: nunjucks.Template }

  static isNeedRender(s: string) {
    return (s || '').indexOf(WuCaiTemplates.leftHolder) >= 0
  }

  // https://mozilla.github.io/nunjucks/templating.html
  // 默认的页面模板
  static Style001: string = `---
标题: "{{title}}"
创建时间: {{createat}}
笔记ID: {{noteid}}
---

## {{title}} 
{{tags}} #五彩插件 [原文]({{url}})

## 页面笔记
{% block pagenote %}
{{pagenote}}
{% endblock %}

## 划线列表
{% block highlights %}
{% for item in highlights %}
{{ item | style1({prefix:"> ", anno:"> 想法：", color:"█  "}) }}
{% endfor %}
{% endblock %}

## 全文剪藏
{% block mdcontent %}
{{mdcontent}}
{% endblock %}

`
  constructor() {
    this.templateEnv = nunjucks.configure({ autoescape: false, trimBlocks: true, lstripBlocks: true })
    // 添加自定义函数, https://mozilla.github.io/nunjucks/api.html#addfilter
    this.templateEnv.addFilter('date', function (ts: number, fmt: string): string {
      if (ts <= 0) {
        return ''
      }
      let dt = new Date(ts * 1000)
      return WuCaiUtils.formatDateTime(dt, fmt)
    })
    this.templateEnv.addFilter('pretty', function (cnt: string, options: FilterPrettyOptions): string {
      options = options || ({} as FilterPrettyOptions)
      let prefix = options.prefix || ''
      let isTrim = options.trim === undefined ? true : options.trim
      cnt = cnt || ''
      if (cnt.length <= 0) {
        return ''
      }
      let lines = cnt.split(/\n/)
      let ret: Array<string> = []
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i] || ''
        if (isTrim) {
          line = line.replace(/^\s+|\s+$/g, '')
        }
        if (line.length <= 0) {
          continue
        }
        ret.push(prefix + line + '\n')
      }
      return ret.join('\n')
    })

    // see https://help.obsidian.md/Editing+and+formatting/Callouts

    this.templateEnv.addFilter(
      'style_dailynote',
      function (highlights: Array<HighlightInfo>, options: FilterStyleDailyOptions) {
        options = options || ({} as FilterStyleDailyOptions)
        let ret = []
        let groupby = options.groupby || 'YYYY-MM-DD HH:mm'
        let groupHighlights: { [key: string]: Array<HighlightInfo> } = {}
        let groupNames: Array<string> = []
        let groupNamesMap: { [key: string]: number } = {}
        for (let highlight of highlights) {
          let ts = WuCaiUtils.formatTime(highlight.createat_ts || highlight.updateat_ts || 0, groupby)
          if (groupNamesMap[ts] == undefined) {
            groupNamesMap[ts] = 1
            groupNames.push(ts)
            groupHighlights[ts] = []
          }
          groupHighlights[ts].push(highlight)
        }
        groupNamesMap = undefined // help for gc
        highlights = undefined // help for gc
        for (let gname of groupNames) {
          let rootlevel = 0
          ret.push(`- ${gname}`)
          let level = rootlevel + 1
          let highlightPrefix = WuCaiUtils.repeatStr('\t', level)
          let annoPrefix = WuCaiUtils.repeatStr('\t', level + 1)
          for (let highlight of groupHighlights[gname]) {
            if (highlight.imageUrl && highlight.imageUrl.length > 0) {
              ret.push(`${highlightPrefix}- ![](${highlight.imageUrl})`)
              continue
            }
            let notes = (highlight.note || '').split('\n')
            for (let note of notes) {
              if (!note || WuCaiUtils.isOnlyDateTimeLine(note)) {
                continue
              }
              let p1 = WuCaiUtils.detectIsMardownFormat(note) ? '' : '- '
              ret.push(`${highlightPrefix}${p1}${note}`)
            }
            if (highlight.annonation) {
              let notes = (highlight.annonation || '').split('\n')
              for (let note of notes) {
                if (!note || WuCaiUtils.isOnlyDateTimeLine(note)) {
                  continue
                }
                let p1 = WuCaiUtils.detectIsMardownFormat(note) ? '' : '- '
                ret.push(`${annoPrefix}${p1}${note}`)
              }
            }
          }
        }
        return ret.join('\n')
      }
    )

    this.templateEnv.addFilter('yaml_text', function (v: any) {
      if (!v) {
        return ''
      }
      if (typeof v !== strref) {
        return 'error type'
      }
      return ' |-\n  ' + v.replace(/\n/g, '\n  ')
    })

    this.templateEnv.addFilter('yaml_field', function (v: any, fname: string) {
      if (!fname || !v) {
        return ''
      }
      if (fname.indexOf(':') < 0) {
        fname += ':'
      }
      return `${fname} ${v}`
    })

    this.templateEnv.addFilter('yaml_list', function (v: any, sep: string = ',', dup = false) {
      if (!v) {
        return ''
      }
      if (!sep) {
        sep = ','
      }
      let ret: Array<string> = []
      if (typeof v === strref) {
        ret = v.split(sep)
      } else if (Array.isArray(v)) {
        ret = v
      }
      ret = ret.filter((x: string) => x)
      if (!ret || ret.length <= 0) {
        return ''
      }
      return WuCaiUtils.toYAMLList(ret)
    })

    // 默认样式1
    this.templateEnv.addFilter('style1', function (item: HighlightInfo, options: FilterStyle1Options) {
      options = options || ({} as FilterStyle1Options)
      let imageUrl = item.imageUrl || ''
      let note = item.note || '' // 划线
      let notePrefix = options.prefix || '' // 划线前缀
      let anno = item.annonation || '' // 想法
      let annoPrefix = options.anno || '' // 想法的前缀
      let highlighttype = item.type || 'highlight'
      let colorChar = options.color_tags || [] // 颜色字符
      let color = options.color || '' // 颜色占位符
      let colorLine = options.color_line || false // 是否需要对整行加颜色
      let slotId = item.slotid || 1
      let appendHighlightRefid = options.refid && true
      let ret = []
      if ('math' === highlighttype) {
        ret.push(`\n$$\n${note}\n$$\n`)
      } else if ('image' === highlighttype || imageUrl) {
        ret.push(`${notePrefix}![](${imageUrl})`)
      } else if (WuCaiUtils.detectIsMardownFormat(note)) {
        ret.push(note)
      } else {
        let lines = note.split(/\n/)
        let lineCount = 0
        for (let line of lines) {
          line = WuCaiUtils.trimString(line)
          if (!line) {
            continue
          }
          if (lineCount == 0 && colorChar && colorChar.length > 0) {
            color = colorChar[slotId - 1]
          }
          if (color && lineCount == 0) {
            ret.push(`${notePrefix}<font color="${item.color}">${color}</font>` + line)
          } else if (colorLine) {
            ret.push(`${notePrefix}<font color="${item.color}">${line}</font>`)
          } else {
            ret.push(`${notePrefix}` + line)
          }
          lineCount++
        }
      }

      if (anno) {
        if (WuCaiUtils.detectIsMardownFormat(anno)) {
          ret.push(anno)
        } else {
          let newLineAnnoPrefix = WuCaiUtils.getPrefxFromAnnoPrefix(annoPrefix)
          let arrAnno = anno.split(/\n/)
          let lineCount = 0
          for (let line of arrAnno) {
            line = WuCaiUtils.trimString(line)
            if (line.length <= 0) {
              continue
            }
            if (annoPrefix) {
              // 标签自动识别
              if (/^#/.test(line)) {
                line = ' ' + line
              }
              if (0 == lineCount) {
                line = annoPrefix + line
              } else {
                line = newLineAnnoPrefix + line
              }
            }
            ret.push(line)
            lineCount++
          }
        }
      }

      let tmpLen = ret.length
      if (appendHighlightRefid) {
        if (tmpLen > 0) {
          ret[tmpLen - 1] += ' ^' + item.refid
        }
      }

      if (tmpLen > 0) {
        ret.push('')
      }
      return ret.join('\n')
    })
    this.cachedTitleTemplates = {}
  }

  // 预编译
  precompile(tpl: string): string {
    let errMessage = ''
    // 提取局部模板提前编译
    let pageStr = tpl || WuCaiTemplates.Style001
    const blocks = WuCaiUtils.getBlocks(pageStr)

    // 对 blocks 添加占位符
    let renderHolders: { [key: string]: string } = {}
    if (blocks.pagenote) {
      renderHolders['pagenote'] = WuCaiUtils.wrapBlock(blocks.pagenote, 'pagenote')
    }
    if (blocks.highlights) {
      renderHolders['highlights'] = WuCaiUtils.wrapBlock(blocks.highlights, 'highlights')
    }
    if (blocks.mdcontent) {
      renderHolders['mdcontent'] = WuCaiUtils.wrapBlock(blocks.mdcontent, 'mdcontent')
    }

    // 提前将 template 编译好
    let pageStrWithHolder = WuCaiUtils.replaceBlocks(pageStr, renderHolders)
    this.pageEngine = nunjucks.compile(pageStrWithHolder, this.templateEnv)

    // 局部模板(不带有占位符)
    this.pagenoteEngine = nunjucks.compile(blocks.pagenote, this.templateEnv)
    this.highlightsEngine = nunjucks.compile(blocks.highlights, this.templateEnv)
    this.mdcontentEngine = nunjucks.compile(blocks.mdcontent, this.templateEnv)

    this.pageTemplateStr = pageStr
    this.blocks = blocks

    return errMessage
  }

  getTitleTemplateByStr(titleTpl: string): nunjucks.Template {
    if (this.cachedTitleTemplates[titleTpl]) {
      return this.cachedTitleTemplates[titleTpl]
    }
    this.cachedTitleTemplates[titleTpl] = nunjucks.compile(titleTpl, this.templateEnv)
    return this.cachedTitleTemplates[titleTpl]
  }
}
