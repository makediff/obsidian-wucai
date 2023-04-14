export class WuCaiTemplates {
  // https://mozilla.github.io/nunjucks/templating.html
  // 默认的页面模板
  static Style001: string = `
---
Title: "{{title}}"
Url: {{url}}
WuCaiUrl: "{{wucaiurl}}"
CreateAt: {{createat}}
---

## {{title}}
{{tags}}

## Page Notes
{% block pagenote %}
{{pagenote}}
{% endblock %}

## Highlights
{% block highlights %}
{% for item in highlights %}
> {{item.note}}
{% endfor %}
{% endblock %}

## Others

> generated by WuCai
`
}
