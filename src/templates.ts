import nunjucks from 'nunjucks'
import { WuCaiUtils } from './utils'

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
{{ item | style1({prefix:"> ", anno:"> __想法__：", color:"█  "}) }}
{% endfor %}
{% endblock %}

## 其他

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

    // 默认样式1
    this.templateEnv.addFilter('style1', function (item: HighlightInfo, options: FilterStyle1Options) {
      options = options || ({} as FilterStyle1Options)
      let imageUrl = item.imageUrl || ''
      let note = item.note || '' // 划线
      let notePrefix = options.prefix || '' // 划线前缀
      let anno = item.annonation || '' // 想法
      let annoPrefix = options.anno || '' // 想法的前缀
      let colorTags = options.color_tags || []
      let color = options.color || '' // 颜色占位符
      let colorLine = options.color_line || false // 是否需要对整行加颜色
      let slotId = item.slotId || 1
      let ret = []
      if (imageUrl) {
        ret.push(`${notePrefix}![](${imageUrl})`)
      } else if (WuCaiUtils.detectIsMardownFormat(note)) {
        // current highlight is a markdown format content, present it
        ret.push(note)
      } else {
        let lines = note.split(/\n/)
        let lineCount = 0
        for (let line of lines) {
          line = line.replace(/^\s+|\s+$/g, '')
          if (!line || line.length <= 0) {
            continue
          }
          if (lineCount == 0 && colorTags && colorTags.length > 0) {
            color = colorTags[slotId - 1]
          }
          if (color && lineCount == 0) {
            // only add color block to head of first line
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
        // 23.8.1 如果想法是一个标签，自动加个空格
        if (WuCaiUtils.detectIsMardownFormat(anno)) {
          ret.push(anno)
        } else {
          if (annoPrefix.length > 0 && /^#/.test(anno)) {
            annoPrefix += ' '
          }
          ret.push(annoPrefix + anno)
        }
      }
      if (ret.length > 0) {
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

    // 提前将 template 编译好
    let pageStrWithHolder = WuCaiUtils.replaceBlocks(pageStr, renderHolders)
    this.pageEngine = nunjucks.compile(pageStrWithHolder, this.templateEnv)

    // 局部模板(不带有占位符)
    this.pagenoteEngine = nunjucks.compile(blocks.pagenote, this.templateEnv)
    this.highlightsEngine = nunjucks.compile(blocks.highlights, this.templateEnv)

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
