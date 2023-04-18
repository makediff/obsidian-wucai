import nunjucks from 'nunjucks'
import { WuCaiUtils } from './utils'

export class WuCaiTemplates {
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

  // https://mozilla.github.io/nunjucks/templating.html
  // 默认的页面模板
  static Style001: string = `---
标题: "{{title}}"
创建时间: {{createat}}
---

## {{title}} 
{{tags}} {{createat}} [原文]({{url}})

## Page Notes
{% block pagenote %}
{{pagenote}}
{% endblock %}

## 划线列表
{% block highlights %}
{% for item in highlights %}
{% if item.imageUrl%}
> ![]({{ item.imageUrl }})
{% else %}
> {{item.note}}
{% endif %}
{%if item.annonation%}
> 想法: {{item.annonation}}
{% endif%}
{% endfor %}
{% endblock %}

## 其他

`
  constructor() {
    this.templateEnv = nunjucks.configure({ autoescape: false, trimBlocks: true, lstripBlocks: true })
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
}
