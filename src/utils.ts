export class WuCaiUtils {
  static formatDateTime(date, format = 'yy-MM-dd HH:mm') {
    if (!date) {
      return ''
    }
    const o = {
      'M+': date.getMonth() + 1, // 月份
      'd+': date.getDate(), // 日
      'h+': date.getHours() % 12 === 0 ? 12 : date.getHours() % 12, // 小时
      'H+': date.getHours(), // 小时
      'm+': date.getMinutes(), // 分
      's+': date.getSeconds(), // 秒
      'q+': Math.floor((date.getMonth() + 3) / 3), // 季度
      S: date.getMilliseconds(), // 毫秒
      a: date.getHours() < 12 ? '上午' : '下午', // 上午/下午
      A: date.getHours() < 12 ? 'AM' : 'PM', // AM/PM
    }
    if (/(y+)/.test(format)) {
      format = format.replace(RegExp.$1, (date.getFullYear() + '').substr(4 - RegExp.$1.length))
    }
    for (let k in o) {
      if (new RegExp('(' + k + ')').test(format)) {
        format = format.replace(RegExp.$1, RegExp.$1.length === 1 ? o[k] : ('00' + o[k]).substr(('' + o[k]).length))
      }
    }
    return format
  }

  // 生成目标文件名
  static generateFileName(nameStyle: number, { title = '', createAt = 0, noteIdX = '' }): string {
    return ''
  }

  // 根据配置生成 tag 列表
  static formatTags(tags: string, exportCfg: WuCaiExportConfig): string {
    return ''
  }

  // 划线和想法内容
  static formatHighlights(highlights: Array<HighlightInfo>, exportCfg: WuCaiExportConfig): string {
    return ''
  }

  // 生成的内容直接替换原有文件
  static renderTemplateWithOverWritten(hodlers: WuCaiHolders, exportCfg: WuCaiExportConfig): string {
    return ''
  }

  // 追加到文件末尾或替换文件里的局部内容
  static renderTemplateWithEditable(hodlers: WuCaiHolders, oldCnt: string, exportCfg: WuCaiExportConfig): string {
    return ''
  }
}
