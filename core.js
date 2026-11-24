/* Pure matching and formatting; no model calls, writes, or network access. */
var TextFoldSyncCore = (() => {
  const clean = s => String(s ?? '').normalize('NFKC');
  const normalized = s => [...clean(s).toLocaleLowerCase('en')].filter(c => /[\p{L}\p{N}]/u.test(c)).join('');
  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
    return JSON.stringify(value ?? null);
  }
  const colors = {
    yellow:'#ffd400', red:'#ff6666', green:'#5fb236', blue:'#2ea8e5',
    purple:'#a28ae5', magenta:'#e56eee', orange:'#f19837', gray:'#aaaaaa',
  };
  const tagPattern = /^[\p{L}\p{N}_/-]{1,120}$/u;
  const tagName = value => value.replace(/^#/, '').normalize('NFC').toLowerCase();
  function validateCodeColors(rows) {
    const map = new Map();
    for (const [tag, color] of rows) {
      const name = tagName(tag.trim());
      const hex = color.toLowerCase();
      if (!tagPattern.test(name)) throw new Error('Gib einen gültigen Hashtag ein.');
      if (!Object.values(colors).includes(hex)) throw new Error('Wähle eine Farbe aus der Zotero-Palette.');
      if (map.has(name)) throw new Error('Der Hashtag #' + name + ' ist bereits vorhanden.');
      map.set(name, hex);
    }
    return Object.fromEntries(map);
  }
  function noteCoding(note, map = {}) {
    const text = (note.text || '').normalize('NFC').trim()
      .replace(/`[^`]*`|https?:\/\/[^\s<>]+|\]\(\s*#[^)]*\)/gu, '');
    const lastLine = text.split(/\r\n?|\n/u).pop().trim().split(/\s+/u);
    // Keep the priority of the dedicated code line supported by older releases.
    const finalTags = lastLine.every(token => token.startsWith('#') && tagPattern.test(tagName(token)))
      ? lastLine.map(tagName)
      : [];
    const inlineTags = [...text.matchAll(/(?<![\p{L}\p{N}_/#\\])#([\p{L}\p{N}_/-]{1,120})(?![\p{L}\p{N}_/-])/gu)]
      .map(match => tagName(match[1]));
    const tags = [...new Set([...finalTags, ...inlineTags])];
    const firstMapped = tags.find(tag => Object.hasOwn(map, tag));
    return {tags, color:firstMapped ? map[firstMapped] : null};
  }
  function sourceSignature(note, isAnnotation = false, coding = {tags:[]}) {
    const source = {kind: note.kind, text: note.text || '', anchor: note.anchor || {},
      thread: (note.thread || (note.ask ? [note.ask] : [])).map(t => ({q:t.q||'',a:t.a||'',error:t.error||'',cites:t.cites||[]}))};
    // Refresh existing PDF comments after the format change without rewriting child notes.
    if (isAnnotation) source.annotationFormat = 3;
    if (coding.tags.length) source.coding = isAnnotation ? coding : coding.tags;
    return stable(source);
  }
  const uri = (paper, note) => 'textfold://open?paper=' + encodeURIComponent(paper) + '&n=' + encodeURIComponent(note);
  function annotationComment(note) {
    const lines = [];
    if (note.text) lines.push(note.text);
    for (const t of note.thread || (note.ask ? [note.ask] : [])) {
      if (t.q) lines.push('Frage: ' + t.q);
      if (t.a) lines.push('Antwort (KI): ' + t.a);
      else if (t.error) lines.push('Antwort fehlgeschlagen: ' + t.error);
    }
    return lines.join('\n\n');
  }
  const escape = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function noteHTML(paper, note, reason) {
    const q = note.anchor?.shown?.exact || note.anchor?.quote?.exact;
    let html = '<h2>TextFold: ' + (note.kind === 'ask' ? 'Frage und Antwort' : 'Notiz') + '</h2>';
    if (reason) html += '<p>' + escape(reason) + '</p>';
    if (q) html += '<blockquote>' + escape(q) + '</blockquote>';
    const lines = ['TextFold', annotationComment(note), 'Zurück zu TextFold: ' + uri(paper, note.id)].filter(Boolean);
    const body = escape(lines.join('\n\n')).replace(/\[\[([\w.-]+)\]\]/g, (_, unit) => '<a href="textfold://open?paper=' + encodeURIComponent(paper) + '&amp;u=' + encodeURIComponent(unit) + '">' + unit + '</a>');
    html += '<p>' + body.replace(/\n/g, '<br/>') + '</p>';
    return html;
  }
  function pageIndex(chars) {
    let text = '', offsets = [];
    chars.forEach((char, index) => {
      if (char.ignorable) return;
      const value = normalized(char.c);
      text += value;
      for (let j=0; j<value.length; j++) offsets.push(index);
    });
    return {text, offsets};
  }
  function matches(indexed, quote) {
    const needle = normalized(quote);
    if (needle.length < 18) return [];
    const out = [];
    for (let at = indexed.text.indexOf(needle); at >= 0; at = indexed.text.indexOf(needle, at + 1)) {
      out.push({start:indexed.offsets[at],end:indexed.offsets[at+needle.length-1]+1});
      if (out.length > 8) break;
    }
    return out;
  }
  function selection(chars, start, end, pageIndex) {
    let rects = [], line = null, text = '';
    for (const char of chars.slice(start, end)) {
      if (char.ignorable) continue;
      const r = char.inlineRect;
      if (!Array.isArray(r) || r.length !== 4 || !r.every(Number.isFinite) || r[2] <= r[0] || r[3] <= r[1]) throw new Error('Ungültige PDF-Textposition');
      if (line && (r[3] < line[1] - 2 || r[1] > line[3] + 2)) { rects.push(line); line=null; }
      line = line ? [Math.min(line[0],r[0]),Math.min(line[1],r[1]),Math.max(line[2],r[2]),Math.max(line[3],r[3])] : [...r];
      text += char.c + (char.lineBreakAfter || char.paragraphBreakAfter || char.spaceAfter ? ' ' : '');
      if (char.lineBreakAfter || char.paragraphBreakAfter) { if(line)rects.push(line);line=null; }
    }
    if (line) rects.push(line);
    if (!rects.length) throw new Error('Keine PDF-Textposition');
    return {pageIndex, anchorOffset:start, headOffset:end, text:text.replace(/\s+/g,' ').trim(), position:{pageIndex,rects:rects.map(r=>r.map(n=>Math.round(n*1000)/1000))}};
  }
  function decision(entry, item, current, source) {
    if (entry && (!item || item.deleted)) return 'deleted';
    if (entry && current !== entry.target) return 'conflict';
    if (entry && source === entry.source) return 'unchanged';
    return item ? 'update' : 'create';
  }
  return {normalized, stable, sourceSignature, colors, validateCodeColors, noteCoding, uri, annotationComment, noteHTML, pageIndex, matches, selection, decision};
})();
if (typeof module !== 'undefined') module.exports = TextFoldSyncCore;
