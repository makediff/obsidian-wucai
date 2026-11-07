# WuCai Highlights Official

The official [WuCai Highlight](https://wucainote.com/) (五彩) plugin for [Obsidian](https://obsidian.md). It automatically syncs your web highlights, annotations, page notes and full-text clips from WuCai into your Obsidian vault as Markdown files.

![](https://wucaiimg.dotalk.cn/plugins/wucai-highlights.png)

WuCai Highlight is a browser extension for highlighting and annotating any web page, available on Chrome, Edge, Firefox and Safari, with sync across desktop and mobile. Learn more in [What is WuCai](https://wucainote.com/en/docs/about/wucai.html).

> **Note:** Sync is a PRO feature and requires an active [WuCai membership](https://wucainote.com/en/docs/account/) (new accounts get a 7-day PRO trial). WuCai runs three independent regions — Asia, Europe and North America — whose accounts and data are isolated; choose the region that matches your account. See [region selection and login](https://wucainote.com/en/login/).

## Features

- **Automatic, one-way sync** — data flows from WuCai to Obsidian. Highlights, thoughts (annotations), page notes and full-text clips are written as Markdown; deleting a file in Obsidian never affects your WuCai data.
- **Customizable notes** — choose the destination folder (default `WuCai`), the title format, and a Nunjucks template that controls YAML front matter, tags, highlight styling and more. See the [template variables](https://wucainote.com/en/docs/sync/obsidian.html#vars).
- **Flexible scheduling** — sync manually, on a timer, or automatically every time Obsidian opens.
- **Incremental sync** — after the first run, only new and updated notes are fetched.

## Installation

1. In Obsidian, open **Settings → Community plugins** and browse the plugin marketplace.
2. Search for `wucai` or `五彩`, install **WuCai highlights Official** and enable it.
3. If you use an in-app browser plugin such as Obsidian Surfing, disable it while authorizing, then re-enable it afterwards — it can block the login flow.

## Connect your account

1. Open the plugin settings and pick your **Region** (Asia / Europe / North America). It must match the region of your WuCai account.
2. Click **Get your WuCai Sync Token** to open the sync-token page for that region, and copy the token.
3. Paste it into **Paste your Token** and click **Login**.
4. Set a **Customize base folder** — use a dedicated folder (default `WuCai`) so synced notes don't mix with your other files.
5. Run **Sync your data now** from the command palette for the first sync. Afterwards, set **Configure resync frequency** or enable **Sync automatically when Obsidian opens**.

Which items are exported and how they are formatted is configured on the [WuCai website](https://wucainote.com/) and picked up by the plugin.

## Documentation

- [Obsidian sync guide (English)](https://wucainote.com/en/docs/sync/obsidian.html)
- [Obsidian 同步教程（中文）](https://wucainote.com/docs/sync/obsidian.html)
- [Template variables](https://wucainote.com/en/docs/sync/obsidian.html#vars) · [Template functions](https://wucainote.com/en/docs/sync/template-ob-fn.html)
- [Sync & export overview](https://wucainote.com/en/docs/sync/)
- [Chinese docs](https://wucainote.com/docs/) · [English docs](https://wucainote.com/en/docs/)
- [WuCai website](https://wucainote.com/) · [Changelog](https://wucainote.com/en/docs/changelog.html)

## Support

- [FAQ](https://wucainote.com/en/docs/about/faq.html) · [Contact us](https://wucainote.com/en/docs/about/contact.html)
- [Feedback](https://feedback.dotalk.cn/note/OlA9f2ef3ee.html)
