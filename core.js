/* Pure matching and formatting; no model calls, writes, or network access. */
var TextFoldSyncCore = (() => {
  const clean = s => String(s ?? '').normalize('NFKC');
  const normalized = s => [...clean(s).toLocaleLowerCase('en')].filter(c => /[\p{L}\p{N}]/u.test(c)).join('');
  function stable(value) {
    if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
    return JSON.stringify(value ?? null);
  }
  function sourceSignature(note) {
    return stable({kind: note.kind, text: note.text || '', anchor: note.anchor || {},
      thread: (note.thread || (note.ask ? [note.ask] : [])).map(t => ({q:t.q||'',a:t.a||'',error:t.error||'',cites:t.cites||[]}))});
  }
  const uri = (paper, note) => 'textfold://open?paper=' + encodeURIComponent(paper) + '&n=' + encodeURIComponent(note);
  function comment(paper, note, context = '') {
    let lines = ['TextFold'];
    if (context) lines.push(context);
    if (note.text) lines.push(note.text);
    for (const t of note.thread || (note.ask ? [note.ask] : [])) {
      if (t.q) lines.push('Frage: ' + t.q);
      if (t.a) lines.push('Antwort (KI): ' + t.a);
      else if (t.error) lines.push('Antwort fehlgeschlagen: ' + t.error);
    }
    lines.push('Zurück zu TextFold: ' + uri(paper, note.id));
    return lines.join('\n\n');
  }
  const escape = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function noteHTML(paper, note, reason) {
    const q = note.anchor?.shown?.exact || note.anchor?.quote?.exact;
    let html = '<h2>TextFold: ' + (note.kind === 'ask' ? 'Frage und Antwort' : 'Notiz') + '</h2>';
    if (reason) html += '<p>' + escape(reason) + '</p>';
    if (q) html += '<blockquote>' + escape(q) + '</blockquote>';
    const body = escape(comment(paper, note)).replace(/\[\[([\w.-]+)\]\]/g, (_, unit) => '<a href="textfold://open?paper=' + encodeURIComponent(paper) + '&amp;u=' + encodeURIComponent(unit) + '">' + unit + '</a>');
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
  return {normalized, stable, sourceSignature, uri, comment, noteHTML, pageIndex, matches, selection, decision};
})();
if (typeof module !== 'undefined') module.exports = TextFoldSyncCore;
