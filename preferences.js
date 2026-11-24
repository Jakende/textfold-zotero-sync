(() => {
  const text = {
    yellow:'Gelb', red:'Rot', green:'Grün', blue:'Blau',
    purple:'Violett', magenta:'Magenta', orange:'Orange', gray:'Grau',
  };
  const init = root => {
    const service = Zotero.TextFoldZoteroSync;
    const get = id => root.querySelector('#tfz-' + id);
    const make = name => document.createElementNS('http://www.w3.org/1999/xhtml', name);
    const rules = get('rules');
    let saving = false;
    let working = false;
    const values = () => [...rules.children].map(row => [row.querySelector('input').value, row.querySelector('select').value]);
    const saved = () => Object.entries(service.config.codeColors || {});
    const refreshRules = () => {
      const dirty = JSON.stringify(values()) !== JSON.stringify(saved());
      get('empty').hidden = !!rules.children.length;
      get('save').disabled = !dirty || saving;
      get('reset').disabled = !dirty || saving;
      get('add').disabled = saving;
      for (const control of rules.querySelectorAll('input, select, button')) control.disabled = saving;
    };
    const message = (id, value, error = false) => {
      get(id).dataset.error = String(error);
      get(id).textContent = value;
    };
    const refresh = () => {
      const entries = Object.values(service.state.entries);
      get('annotations').textContent = entries.filter(entry => entry.kind === 'annotation').length;
      get('notes').textContent = entries.filter(entry => entry.kind === 'note').length;
      get('auto').checked = !!service.config.enabled;
      get('folder').textContent = service.libraryRoot || 'Kein TextFold-Datenordner ausgewählt.';
      get('default').disabled = working || !service.config.libraryRoot;
      for (const id of ['sync', 'auto', 'choose']) get(id).disabled = working;
      const report = service.report;
      get('time').textContent = report.time ? new Date(report.time).toLocaleString() : '–';
      const messages = [
        ...Object.values(service.state.issues).map(issue => issue.title + ' – ' + issue.reason),
        ...(report.errors || []).map(issue => issue.paper + ' – ' + issue.error),
      ];
      get('issues').hidden = !messages.length;
      get('issues-title').textContent = 'Hinweise (' + messages.length + ')';
      get('issues-list').replaceChildren(...messages.map(value => {
        const item = make('li');
        item.textContent = value;
        return item;
      }));
      if (report.status === 'waiting-for-textfold') message('sync-status', 'TextFold-Daten fehlen. Öffne TextFold oder wähle den Datenordner.', true);
    };
    const inputChanged = () => { message('rule-status', ''); refreshRules(); };
    const addRow = (tag = '', color = '#ffd400', focus = false) => {
      const row = make('div');
      row.className = 'tfz-rule';
      const input = make('input');
      input.type = 'text';
      input.value = tag;
      input.placeholder = '#methode';
      input.setAttribute('aria-label', 'Hashtag');
      input.addEventListener('input', inputChanged);
      const group = make('div');
      group.className = 'tfz-color';
      const swatch = make('span');
      swatch.className = 'tfz-swatch';
      swatch.setAttribute('aria-hidden', 'true');
      const select = make('select');
      select.setAttribute('aria-label', 'Zotero-Farbe');
      for (const [name, hex] of Object.entries(service.core.colors)) {
        const option = make('option');
        option.value = hex;
        option.textContent = text[name];
        select.add(option);
      }
      select.value = color;
      swatch.style.backgroundColor = select.value;
      select.addEventListener('change', () => { swatch.style.backgroundColor = select.value; inputChanged(); });
      const remove = make('button');
      remove.type = 'button';
      remove.textContent = 'Entfernen';
      remove.addEventListener('click', () => {
        const next = row.nextElementSibling || row.previousElementSibling;
        row.remove();
        inputChanged();
        (next?.querySelector('input') || get('add')).focus();
      });
      group.append(swatch, select);
      row.append(input, group, remove);
      rules.append(row);
      if (focus) input.focus();
    };
    const load = () => {
      rules.replaceChildren();
      for (const [tag, color] of saved()) addRow(tag, color);
      refreshRules();
    };
    const run = async callback => {
      working = true;
      message('sync-status', '');
      refresh();
      try { await callback(); }
      catch (error) { message('sync-status', error.message, true); }
      finally { working = false; refresh(); }
    };
    get('add').addEventListener('click', () => { addRow('', '#ffd400', true); inputChanged(); });
    get('reset').addEventListener('click', () => { load(); message('rule-status', ''); });
    get('save').addEventListener('click', async () => {
      saving = true;
      message('rule-status', 'Wird gespeichert und übertragen…');
      refreshRules();
      try {
        const report = await service.saveCodeColors(values());
        load();
        const review = report.status === 'attention' || report.status === 'waiting-for-textfold';
        message('rule-status', review ? 'Codefarben gespeichert. Prüfe die Hinweise zur Übertragung.' : 'Codefarben gespeichert.');
      } catch (error) { message('rule-status', error.message, true); }
      finally { saving = false; refreshRules(); refresh(); }
    });
    get('sync').addEventListener('click', () => run(async () => {
      message('sync-status', 'Übertragung läuft…');
      const report = await service.sync({manual:true});
      const labels = {ok:'Übertragung geprüft.', attention:'Übertragung geprüft. Hinweise beachten.', busy:'Eine Übertragung läuft bereits.'};
      message('sync-status', labels[report.status] || '');
    }));
    get('auto').addEventListener('change', event => {
      const enabled = event.target.checked;
      void run(() => service.enabled(enabled));
    });
    get('choose').addEventListener('click', () => run(() => service.chooseLibrary(window)));
    get('default').addEventListener('click', () => run(() => service.saveLibraryRoot(null)));
    root.addEventListener('showing', refresh);
    load();
    refresh();
  };

  // Zotero loads the script before it inserts the pane fragment.
  const attach = () => {
    const root = document.getElementById('tfz-preferences');
    if (!root) return;
    observer.disconnect();
    init(root);
  };
  const observer = new MutationObserver(attach);
  observer.observe(document.documentElement, {childList:true, subtree:true});
  attach();
})();
