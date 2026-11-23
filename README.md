# TextFold to Zotero

A Zotero desktop add-on that brings highlights, comments, and questions from TextFold back to the source in your Zotero library. When the add-on can locate a passage in the matching PDF, it saves a native Zotero highlight with your comment. Whole-document questions and passages without a reliable match become notes attached to the literature item.

[Download the beta](https://github.com/Jakende/textfold-zotero-sync/releases/tag/v1.1.0-beta.2) · [All releases](https://github.com/Jakende/textfold-zotero-sync/releases) · [Report an issue](https://github.com/Jakende/textfold-zotero-sync/issues/new)

This is an independent community add-on maintained by [Jakende](https://github.com/Jakende).

## Compatibility

| Component | Beta status |
| --- | --- |
| Zotero Desktop | 10.0.x. Verified with Zotero 10.0.9. |
| TextFold | Verified with the local library format from TextFold 0.10.57. |
| macOS | Transfer and Zotero upload verified on Apple silicon. The packaged beta also passed a startup test in a separate Zotero profile. |
| Windows | Standard and custom paths covered by automated tests. Annotation creation and updates verified in Zotero Desktop 10.0.8 with a fixture. A full test with both desktop apps on Windows is pending. |

Both platforms use the same XPI. This beta uses German labels in the add-on menu. The steps below give the exact menu labels.

## Install and try a transfer

1. Download the `.xpi` under **Assets** in the [beta release](https://github.com/Jakende/textfold-zotero-sync/releases/tag/v1.1.0-beta.2).
2. In Zotero, open **Tools → Plugins** (also called **Add-ons** in some versions or translations) and drag the XPI onto the window. See the [Zotero installation guide](https://www.zotero.org/support/plugins).
3. In TextFold, open a source using its Zotero library picker. To try PDF highlighting, pick an item with a local PDF and add a comment to a passage in the original text.
4. In Zotero, open **Tools → TextFold → Zotero → Jetzt übertragen**. Check the PDF reader for the highlight or open the child note under the source item.
5. To enable automatic transfers, select **Automatische Übertragung ein/aus**. On a fresh installation the automatic mode starts paused. Once enabled, Zotero checks for changes about every five seconds while it runs.

### TextFold library folder

The add-on detects the default TextFold folder on macOS (`~/Library/Application Support/TextFold`) and Windows (`%LOCALAPPDATA%\TextFold`). It can also use an inherited `TEXTFOLD_DATA` setting. [TextFold desktop documentation](https://github.com/chenxiachan/textfold/blob/main/desktop/README.md)

For a custom folder, use **TextFold-Datenordner auswählen…** and select the parent of the `papers` folder. **Status anzeigen** shows the active folder and any conflicts. **TextFold-Standardordner verwenden** clears a manual selection.

## Transfers and data

- The source needs a Zotero reference recorded by TextFold. PDF placement requires an unambiguous text match in the Zotero PDF that matches TextFold's local copy. A scan without a usable text layer, an ambiguous match, or a missing PDF falls back to a child note.
- Each transferred note has a stable identity. Repeating the transfer reuses the same Zotero item. If you independently edit a transferred note in Zotero, the add-on preserves your version and reports a conflict. If you delete a transferred item in Zotero, it stays deleted. Deleting a note in TextFold leaves the Zotero copy in place.
- PDF annotations show your comment and any associated question and answer. Updating an untouched annotation from an earlier beta removes the old TextFold footer and tag from that same annotation.
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

Windows test reports are particularly useful. In a [GitHub issue](https://github.com/Jakende/textfold-zotero-sync/issues/new), include your OS, Zotero and TextFold versions, add-on version, and the steps to reproduce the behavior. Share a public sample PDF or anonymized details when possible.

To build from source with Node.js and Python:

```sh
node --test core.test.cjs platform.test.cjs
python build.py
```

The XPI is written to `dist/`. GitHub Actions runs the tests and build on macOS and Windows. These checks cover the platform path logic and packaging. The native Windows check uses an isolated Zotero profile and a fixture.

Licensed under the [GNU Affero General Public License, version 3](LICENSE).
