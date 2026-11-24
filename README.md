# TextFold to Zotero

[![Latest stable release](https://img.shields.io/github/v/release/Jakende/textfold-zotero-sync?label=release&color=2563eb)](https://github.com/Jakende/textfold-zotero-sync/releases/latest)
[![Zotero Desktop 10.0.x](https://img.shields.io/badge/Zotero-10.0.x-b42318)](https://www.zotero.org/download/)
[![TextFold 0.10.57](https://img.shields.io/badge/TextFold-0.10.57-42657a)](https://github.com/chenxiachan/textfold/releases/tag/v0.10.57)
[![macOS and Windows](https://img.shields.io/badge/platforms-macOS%20%7C%20Windows-42657a)](https://github.com/Jakende/textfold-zotero-sync#compatibility)
[![License AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-42657a)](LICENSE)

A Zotero desktop add-on that brings highlights, comments, and questions from TextFold back to the source in your Zotero library. Hashtags in TextFold comments become searchable Zotero tags. Optional color rules set the color of PDF annotations. The standard TextFold app works with this add-on. When the add-on can locate a passage in the matching PDF, it saves a native Zotero highlight with your comment. Whole-document questions and passages without a reliable match become notes attached to the literature item.

[Download the stable release](https://github.com/Jakende/textfold-zotero-sync/releases/latest) · [All releases](https://github.com/Jakende/textfold-zotero-sync/releases) · [Report an issue](https://github.com/Jakende/textfold-zotero-sync/issues/new)

This is an independent community add-on maintained by [Jakende](https://github.com/Jakende).

## Compatibility

| Component | Supported version or platform |
| --- | --- |
| Zotero Desktop | 10.0.x |
| TextFold | 0.10.57 |
| Operating systems | macOS and Windows |

Both platforms use the same XPI. The add-on menu uses German labels.

## Install and transfer notes

1. Download the `.xpi` under **Assets** in the [stable release](https://github.com/Jakende/textfold-zotero-sync/releases/latest).
2. In Zotero, open **Tools → Plugins** (also called **Add-ons** in some versions or translations) and drag the XPI onto the window. See the [Zotero installation guide](https://www.zotero.org/support/plugins).
3. In TextFold, open a source using its Zotero library picker. For a PDF annotation, pick an item with a local PDF and add a comment to a passage in the original text.
4. In Zotero, open **Tools → TextFold → Zotero → Jetzt übertragen**. Check the PDF reader for the highlight or open the child note under the source item.
5. To enable automatic transfers, open **Einstellungen und Status…** and enable **Automatisch übertragen**. On a fresh installation the automatic mode starts paused. Once enabled, Zotero checks for changes about every five seconds while it runs.

## Color annotations with research codes

1. In Zotero, open **Tools → TextFold → Zotero → Einstellungen und Status…**. Under **Codefarben**, choose **Zuordnung hinzufügen**, enter a hashtag, and click a swatch in the Zotero palette. For example, add `#barrier` in red and `#method` in blue. Choose **Speichern** to apply the rules, or **Verwerfen** to restore the last saved rules.
2. Add hashtags anywhere in a passage comment in TextFold. A final line containing only hashtags takes priority when picking a color. For example:

   ```text
   The paper identifies fragmented responsibilities as a barrier.

   #barrier #method
   ```

3. Transfer the note. The first mapped hashtag sets the PDF color. Hashtags become Zotero tags without the `#` prefix even when they have no color rule. Matching is case-insensitive. The comment and hashtags remain available in the Markdown export.

TextFold retains its reading-level colors, and the same hashtags can be used in the Obsidian export. When a passage is transferred as a Zotero child note, it receives the tags. Changing a mapping refreshes earlier imports that are still under the add-on's control. Clearing a color rule restores the original color if no mapped codes remain. Removing a hashtag from the comment removes its Zotero tag only when that tag was added by the add-on.

## TextFold library folder

The add-on detects the default TextFold folder on macOS (`~/Library/Application Support/TextFold`) and Windows (`%LOCALAPPDATA%\TextFold`). It can also use an inherited `TEXTFOLD_DATA` setting. [TextFold desktop documentation](https://github.com/chenxiachan/textfold/blob/main/desktop/README.md)

In **Einstellungen und Status…**, use **Ordner auswählen…** to select the parent of the `papers` folder. **Standard verwenden** clears a manual selection. The **Übertragung** section shows the last check and lists any conflicts under **Hinweise**.

## Transfers and data

- The source needs a Zotero reference recorded by TextFold. PDF placement requires an unambiguous text match in the Zotero PDF that matches TextFold's local copy. A scan without a usable text layer, an ambiguous match, or a missing PDF falls back to a child note.
- Each transferred note has a stable identity. Repeating the transfer reuses the same Zotero item. If you independently edit a transferred note in Zotero, the add-on preserves your version and reports a conflict. If you delete a transferred item in Zotero, it stays deleted. Deleting a note in TextFold leaves the Zotero copy in place.
- PDF annotations show your comment and any associated question and answer. Updating an untouched annotation from an earlier beta also removes generated source-text notices, the old TextFold footer, and the old automatic TextFold tag.
- The add-on reads the local TextFold library and keeps its transfer map in the Zotero profile. It makes no AI requests. Any Zotero account sync follows your Zotero settings. Keep the transfer map when moving to a new profile if you want to retain update history.
- Zotero stores native annotations in its database and shows them at the matching passage. Use Zotero's PDF export for a copy with embedded annotations. [Zotero documentation on annotation storage](https://www.zotero.org/support/kb/annotations_in_database)

## Related projects

| Project | Role |
| --- | --- |
| [TextFold](https://github.com/chenxiachan/textfold) · [Desktop downloads](https://chenxiachan.github.io/textfold/#download) | Read and annotate papers. Its Zotero picker imports sources from your library. |
| [TextFold browser extension](https://chromewebstore.google.com/detail/textfold/lkfemlafmabkdjedldmjebdpccdaeglf) | Send a page from a supported browser to TextFold. |
| [TextFold Bridge for Obsidian](https://github.com/adalach/obsidian-textfold-bridge) | Bring TextFold notes and links into Obsidian. |
| [Zotero](https://github.com/zotero/zotero) · [Desktop downloads](https://www.zotero.org/download/) | Manage literature and read PDFs with native annotations. |
| [Zotero Connector](https://www.zotero.org/download/connectors) | Save references and attachments from your browser to Zotero. |

The PDF location code draws on prior work in [LLM-for-Zotero](https://github.com/yilewang/llm-for-zotero). See [NOTICE](NOTICE) for attribution.

## Feedback and development

In a [GitHub issue](https://github.com/Jakende/textfold-zotero-sync/issues/new), include your OS, Zotero and TextFold versions, add-on version, and the steps to reproduce the behavior. Share a public sample PDF or anonymized details when possible.

To build the XPI from source, run:

```sh
python build.py
```

The XPI is written to `dist/`.

Licensed under the [GNU Affero General Public License, version 3](LICENSE).
