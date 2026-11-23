var TextFoldZoteroSync = new class {
  constructor() {
    this.core = TextFoldSyncCore;
    this.running = false; this.stopped = true; this.timer = null;
    this.files = new Map(); this.hashes = new Map(); this.docs = new Map();
    this.report = {status:'initializing'};
  }
  async start() {
    this.dir = PathUtils.join(PathUtils.profileDir, 'textfold-zotero-sync');
    await IOUtils.makeDirectory(this.dir,{ignoreExisting:true});
    this.state = await this.read(PathUtils.join(this.dir,'state.json'), {format:1,entries:{}});
    if(this.state.format!==1||!this.state.entries)throw new Error('Unbekanntes Synchronisationsformat');
    this.state.issues ||= {};
    this.config = await this.read(PathUtils.join(this.dir,'config.json'), {enabled:false,interval:5000});
    this.setLibraryRoot(this.config.libraryRoot || this.defaultLibraryRoot());
    this.stopped=false; this.report={status:this.config.enabled?'ready':'paused',time:new Date().toISOString()};
    await this.write('status.json',this.report); this.schedule();
  }
  defaultLibraryRoot() {
    const customRoot = Services.env.get('TEXTFOLD_DATA')?.trim();
    if (customRoot) return customRoot;
    if (platform === 'Darwin') return PathUtils.join(homeDir, 'Library', 'Application Support', 'TextFold');
    if (platform === 'WINNT') {
      const localAppData = Services.env.get('LOCALAPPDATA');
      if (localAppData) return PathUtils.join(localAppData, 'TextFold');
    }
    return null;
  }
  setLibraryRoot(root) {
    this.libraryRoot = root;
    this.papers = root ? PathUtils.join(root, 'papers') : null;
    this.files.clear();
    this.hashes.clear();
    this.docs.clear();
  }
  async chooseLibrary(window) {
    const picker = new FilePicker();
    picker.init(window, 'TextFold-Datenordner auswählen', picker.modeGetFolder);
    if (this.libraryRoot) picker.displayDirectory = this.libraryRoot;
    if (await picker.show() !== picker.returnOK) return;
    const root = picker.file;
    const papers = PathUtils.join(root, 'papers');
    if (!await IOUtils.exists(papers) || (await IOUtils.stat(papers)).type !== 'directory') {
      throw new Error('Wähle den TextFold-Datenordner, der den Unterordner „papers“ enthält.');
    }
    await this.saveLibraryRoot(root);
    window.alert('TextFold-Datenordner gesetzt: ' + root);
  }
  async saveLibraryRoot(root) {
    if (this.running || this.changingLibrary) throw new Error('Warte, bis die laufende Übertragung abgeschlossen ist.');
    this.changingLibrary = true;
    try {
      const config = {...this.config, libraryRoot: root};
      await this.write('config.json', config);
      this.config = config;
      this.setLibraryRoot(root || this.defaultLibraryRoot());
      this.report = {status: 'ready'};
    } finally {
      this.changingLibrary = false;
    }
  }
  async stop() {
    this.stopped=true; if(this.timer)clearTimeout(this.timer);
    while(this.running)await new Promise(resolve=>setTimeout(resolve,50));
  }
  schedule() {
    if(this.stopped)return;
    this.timer=setTimeout(async()=>{try{if(this.config.enabled)await this.sync();}catch(e){Zotero.logError(e);}finally{this.schedule();}},this.config.interval||5000);
  }
  async read(path,fallback) {
    try{return JSON.parse(await IOUtils.readUTF8(path));}catch(e){if(fallback!==undefined&&e.name==='NotFoundError')return fallback;throw e;}
  }
  async write(name,value) {
    const path=PathUtils.join(this.dir,name);
    await IOUtils.writeUTF8(path,JSON.stringify(value,null,2)+'\n',{tmpPath:path+'.tmp',flush:true});
  }
  async persist(){await this.write('state.json',this.state);}
  hash(text){return Zotero.Utilities.Internal.md5(String(text));}
  itemState(item) {
    if(item.isAnnotation())return this.core.stable({parent:item.parentKey,type:item.annotationType,text:item.annotationText||'',comment:item.annotationComment||'',position:JSON.parse(item.annotationPosition),color:item.annotationColor,pageLabel:item.annotationPageLabel,sortIndex:item.annotationSortIndex,tags:item.getTags(),relations:item.getRelations()});
    return this.core.stable({parent:item.parentKey,html:item.getNote(),tags:item.getTags(),relations:item.getRelations()});
  }
  key(uri) {
    const hex=this.hash(uri),chars='23456789ABCDEFGHIJKLMNPQRSTUVWXYZ';
    return Array.from({length:8},(_,i)=>chars[parseInt(hex.slice(i*2,i*2+2),16)%chars.length]).join('');
  }
  async fileHash(path) {
    const stat=await IOUtils.stat(path),token=stat.lastModified+':'+stat.size;
    const cached=this.hashes.get(path); if(cached?.token===token)return cached.hash;
    const hash=await Zotero.Utilities.Internal.md5Async(path);this.hashes.set(path,{token,hash});return hash;
  }
  library(z) {
    if(z.library==='users/0'||z.library==='users/'+Zotero.Users.getCurrentUserID())return Zotero.Libraries.userLibraryID;
    const group=/^groups\/(\d+)$/.exec(z.library||'');return group?Zotero.Groups.getLibraryIDFromGroupID(Number(group[1])):null;
  }
  async attachment(parent,paperDir) {
    const source=PathUtils.join(paperDir,'source.pdf');
    if(!await IOUtils.exists(source))return {reason:'Keine lokale Original-PDF in TextFold; als Zotero-Notiz übertragen.'};
    const hash=await this.fileHash(source),matches=[];
    for(const item of await Zotero.Items.getAsync(parent.getAttachments())) {
      if(!item.isPDFAttachment()||item.deleted)continue;
      const path=await item.getFilePathAsync();
      if(path&&await IOUtils.exists(path)&&await this.fileHash(path)===hash)matches.push(item);
    }
    return matches.length===1?{item:matches[0],hash}:{reason:matches.length?'Mehrere identische PDF-Anhänge; als Zotero-Notiz übertragen.':'Das Original-PDF ist nicht eindeutig zugeordnet oder wurde geändert; als Zotero-Notiz übertragen.'};
  }
  async document(id) {
    if(this.docs.has(id))return this.docs.get(id);
    try {
      const file=PathUtils.join(this.libraryRoot,'server.json');const server=await this.read(file);
      const u=new URL(server.url);if(u.protocol!=='http:'||u.hostname!=='127.0.0.1'||u.username||u.password)throw new Error('Keine lokale TextFold-Adresse');
      const response=await Zotero.HTTP.request('GET',u.origin+'/api/doc/'+encodeURIComponent(id)+'?lang=en',{timeout:3000});
      const doc=JSON.parse(response.responseText);this.docs.set(id,doc);return doc;
    }catch{return null;}
  }
  async quotations(id,note) {
    if(note.anchor?.on==='paper'||note.anchor?.lost)return [];
    const quotes=[]; if(note.anchor?.quote?.exact)quotes.push({text:note.anchor.quote.exact,context:''});
    if(note.anchor?.unit) {
      const d=await this.document(id); const unit=d?.sections?.flatMap(s=>s.units||[]).find(u=>u.id===note.anchor.unit);
      if(unit) {
        const sents=note.anchor.sents;
        if(sents?.length&&Array.isArray(unit.sentences)){
          const text=sents.map(i=>unit.sentences[i]).filter(Boolean).join(' ');
          if(text)quotes.push({text,context:'Markiert sind die zugehörigen Originalsätze.'});
        }
        if(unit.full)quotes.push({text:unit.full,context:'Markiert ist der zugehörige Originalabsatz.'});
      }
    }
    return quotes.filter((q,i)=>this.core.normalized(q.text).length>=18&&quotes.findIndex(x=>this.core.normalized(x.text)===this.core.normalized(q.text))===i);
  }
  unwrap(x){return x?.wrappedJSObject||x;}
  async locate(attachment,quotations) {
    if(!quotations.length)return null;
    let reader=(Zotero.Reader._readers||[]).find(r=>Number(r?.itemID||r?._item?.id)===attachment.id),opened=!reader;
    try {
      if(!reader)reader=await Zotero.Reader.open(attachment.id,undefined,{openInBackground:true});
      await reader._initPromise;
      const internal=this.unwrap(reader._internalReader),view=this.unwrap(internal._primaryView);
      await view.initializedPromise;
      const app=this.unwrap(this.unwrap(view._iframeWindow).PDFViewerApplication),pdf=this.unwrap(app.pdfDocument);
      if(!pdf||pdf.numPages>500||typeof view._getAnnotationFromSelectionRanges!=='function')return null;
      const pages=[],deadline=Date.now()+30000;
      for(let i=0;i<pdf.numPages;i++) {
        if(this.stopped||Date.now()>deadline)return null;
        if(view._ensureBasicPageData)await view._ensureBasicPageData(i);else await view._documentData.ensurePage(i);
        const chars=this.unwrap(view._pdfPages[i])?.chars;if(!Array.isArray(chars))return null;
        pages.push({chars,index:this.core.pageIndex(chars)});
      }
      for(const quote of quotations) {
        const matches=[];
        for(let i=0;i<pages.length;i++)for(const span of this.core.matches(pages[i].index,quote.text))matches.push({page:i,...span});
        if(matches.length!==1)continue;
        const m=matches[0],range=this.core.selection(pages[m.page].chars,m.start,m.end,m.page);
        const json=this.unwrap(reader._iframeWindow)?.JSON||this.unwrap(view._iframeWindow)?.JSON;
        const native=value=>json?json.parse(JSON.stringify(value)):value;
        const box=view._pdfPages[m.page].viewBox;
        const top=Math.max(0,Math.floor(box[3]-box[1]-Math.max(...range.position.rects.map(r=>r[3]))));
        const meta=view.getAnnotationMeta?view.getAnnotationMeta(native(range.position)):{sortIndex:[String(m.page).padStart(5,'0'),String(m.start).padStart(6,'0'),String(top).padStart(5,'0')].join('|')};
        const annotation=view._getAnnotationFromSelectionRanges(native([{...range,sortIndex:meta.sortIndex}]),'highlight');
        if(annotation?.position?.rects?.length&&annotation.text&&annotation.sortIndex)return {...JSON.parse(JSON.stringify(annotation)),context:quote.context};
      }
      return null;
    }finally {if(opened&&reader&&Zotero.getMainWindow().Zotero_Tabs?.selectedID!==reader.tabID)await reader.close();}
  }
  owns(item,uri){
    const entry=this.state.entries[uri];
    return !!entry&&entry.key===item.key&&entry.libraryID===item.libraryID&&entry.kind===(item.isAnnotation()?'annotation':'note');
  }
  async transfer(paper,meta,note,parent,att,options={}) {
    const uri=this.core.uri(paper,note.id),entry=this.state.entries[uri];
    const color=this.core.colorOf(note), codes=this.core.codeTags(note);
    const oldCodes=new Set(entry?.codes||[]);
    const source=this.hash(this.core.sourceSignature(note, entry?.kind==='annotation'));
    if(entry&&(entry.libraryID!==parent.libraryID||entry.parent!==parent.key))return {result:'conflict',reason:'Die Zotero-Quellenzuordnung hat sich geändert; keine automatische Verschiebung oder Neuanlage.',uri};
    const key=entry?.key||this.key(uri+'|'+parent.libraryKey);
    let item=Zotero.Items.getByLibraryAndKey(parent.libraryID,key)||null;
    if(item&&!this.owns(item,uri))return {result:'conflict',reason:'Zielschlüssel gehört nicht zu dieser TextFold-Notiz',uri};
    if(item?.deleted||entry&&!item)return {result:'deleted',reason:'In Zotero entfernt; wird nicht neu angelegt',uri};
    if(entry?.blocked)return {result:'conflict',reason:'Die übertragene Fassung wurde in Zotero geändert; sie bleibt erhalten.',uri};
    if(item?.isAnnotation()&&(!att.item||att.item.key!==item.parentKey))return {result:'conflict',reason:'Das zugeordnete Original-PDF ist nicht mehr eindeutig oder wurde geändert.',uri};
    const current=item?this.hash(this.itemState(item)):null;
    let decision=this.core.decision(entry,item,current,source);
    if(decision==='conflict'||decision==='deleted'||decision==='unchanged')return {result:decision,uri};
    if(item&&!entry)return {result:'conflict',reason:'Vorhandene Übertragung ohne Sicherungsstand; keine Änderung',uri};
    if(options.dryRun)return {result:decision,uri,target:entry?.kind||'auto'};
    const old=item?item.toJSON():null;
    if(item){options.journal?.snapshot(item);await this.write('last-before-change.json',{time:new Date().toISOString(),uri,item:old});}
    let geometry=null,reason=att.reason||'';
    const anchor=this.hash(this.core.stable(note.anchor||{}));
    if(!item||item.isAnnotation()&&entry?.anchor!==anchor) {
      const quotes=await this.quotations(paper,note);
      if(att.item&&quotes.length)try{geometry=await this.locate(att.item,quotes);}catch(e){reason='PDF-Position konnte nicht sicher bestimmt werden: '+e.message;}
      if(item?.isAnnotation()&&!geometry)return {result:'conflict',reason:'Die neue TextFold-Passage konnte nicht sicher im PDF gefunden werden; bestehende Anmerkung bleibt erhalten.',uri};
      if(!geometry&&!reason)reason=note.anchor?.on==='paper'?'Notiz zum gesamten Dokument.':'Keine eindeutige Originalpassage gefunden; als Zotero-Notiz übertragen.';
    }
    if(item&&this.hash(this.itemState(item))!==current)return {result:'conflict',reason:'Ziel wurde während der Übertragung bearbeitet',uri};
    if(item?.isAnnotation()||geometry) {
      const json=item?Zotero.Annotations.toJSONSync(item):{...geometry,key,type:'highlight',color:'#a28ae5'};
      if(item&&geometry)for(const field of ['text','position','pageLabel','sortIndex'])json[field]=geometry[field];
      json.key=key;
      json.comment=this.core.annotationComment(note,entry?.context||geometry?.context||'');
      if(color||entry?.color)json.color=color||'#a28ae5';
      json.tags=(json.tags||[]).filter(tag=>tag.name!=='TextFold' && !oldCodes.has(tag.name));
      for(const name of codes)if(!json.tags.some(tag=>tag.name===name))json.tags.push({name});
      item=await Zotero.Annotations.saveFromJSON(item?.parentItem||att.item,json);
    }else {
      if(!item){item=new Zotero.Item('note');item.libraryID=parent.libraryID;item.key=key;await item.loadPrimaryData();item.parentID=parent.id;item.addTag('TextFold');}
      for(const tag of oldCodes)if(!codes.includes(tag))item.removeTag(tag);
      for(const tag of codes)item.addTag(tag);
      item.setNote(this.core.noteHTML(paper,note,entry?.reason||reason));await item.saveTx({skipSelect:true});
    }
    if(!old)options.journal?.recordCreatedItem(item);
    const isAnnotation=item.isAnnotation();
    this.state.entries[uri]={key:item.key,libraryID:item.libraryID,parent:parent.key,attachment:isAnnotation?item.parentItem.key:null,kind:isAnnotation?'annotation':'note',color:isAnnotation?color:null,codes,source:entry?source:this.hash(this.core.sourceSignature(note,isAnnotation)),anchor,target:this.hash(this.itemState(item)),context:geometry?.context||entry?.context||'',reason:entry?.reason||reason,time:new Date().toISOString()};
    await this.persist();
    return {result:old?'updated':'created',uri,key:item.key,id:item.id,kind:this.state.entries[uri].kind,pageIndex:item.isAnnotation()?JSON.parse(item.annotationPosition).pageIndex:null,reason};
  }
  async sync(options={}) {
    if (this.running || this.changingLibrary) return {status:'busy'};
    this.running=true;const report={time:new Date().toISOString(),dryRun:!!options.dryRun,results:[],errors:[],status:'ok'};
    try {
      if (!this.papers || !await IOUtils.exists(this.papers)) {
        report.status = 'waiting-for-textfold';
        this.report = report;
        if (!options.dryRun) await this.write('status.json', report);
        return report;
      }
      for(const dir of await IOUtils.getChildren(this.papers)) {
        if(this.stopped)break;
        const stat=await IOUtils.stat(dir);if(stat.type!=='directory')continue;
        const paper=PathUtils.filename(dir);if(!/^[\w.-]{1,120}$/.test(paper))continue;
        const notesPath=PathUtils.join(dir,'notes.json');if(!await IOUtils.exists(notesPath))continue;
        try {
          const ns=await IOUtils.stat(notesPath),signature=ns.lastModified+':'+ns.size;
          if(!options.manual&&!options.dryRun&&this.files.get(paper)===signature)continue;
          const meta=await this.read(PathUtils.join(dir,'meta.json'));if(!meta.zotero)continue;
          const data=await this.read(notesPath);
          if(!['textfold/notes','paperfold/notes','dynamic-reader/notes'].includes(data.format)||data.version!==1||data.paper.id!==paper||!Array.isArray(data.notes))throw new Error('Ungültiges TextFold-Notizformat');
          if(!data.notes.length){
            const prefix='textfold://open?paper='+encodeURIComponent(paper)+'&n=';
            if(!options.dryRun){this.files.set(paper,signature);for(const uri of Object.keys(this.state.issues))if(uri.startsWith(prefix))delete this.state.issues[uri];}
            continue;
          }
          const libraryID=this.library(meta.zotero);if(!libraryID)throw new Error('Zotero-Bibliothek nicht zugeordnet');
          const parent=Zotero.Items.getByLibraryAndKey(libraryID,meta.zotero.item);
          if(!parent||!parent.isRegularItem())throw new Error('Zotero-Quelle fehlt');
          if(parent.deleted)throw new Error('Die zugeordnete Zotero-Quelle liegt im Papierkorb; keine automatische Wiederherstellung.');
          if(!Zotero.Libraries.get(libraryID).editable)throw new Error('Zotero-Bibliothek schreibgeschützt');
          const ids=data.notes.map(n=>n.id);if(new Set(ids).size!==ids.length)throw new Error('Doppelte TextFold-Notiz-ID');
          const prefix='textfold://open?paper='+encodeURIComponent(paper)+'&n=';
          for(const uri of Object.keys(this.state.issues))if(uri.startsWith(prefix)&&!ids.includes(decodeURIComponent(uri.slice(prefix.length))))delete this.state.issues[uri];
          let att=null;
          for(const note of data.notes) {
            if(!/^[\w-]{1,80}$/.test(note.id))throw new Error('Ungültige Notiz-ID');
            if((note.thread||[]).some(t=>t.pending))continue;
            if(!att)att=await this.attachment(parent,dir);
            const result=await this.transfer(paper,meta,note,parent,att,options);
            report.results.push(result);
            if(!options.dryRun){
              if(['conflict','deleted'].includes(result.result)){
                const old=this.state.issues[result.uri];
                this.state.issues[result.uri]={type:result.result,title:meta.title||paper,reason:result.reason||'Die übertragene Notiz wurde in Zotero geändert.',time:old?.time||new Date().toISOString()};
                if(!old&&result.result==='conflict')this.notifyConflict();
              }else delete this.state.issues[result.uri];
            }
          }
          if(!options.dryRun)this.files.set(paper,signature);
        }catch(e){report.errors.push({paper,error:String(e.message||e)});}
      }
      report.issues=Object.values(this.state.issues);
      if(report.errors.length||report.issues.some(i=>i.type==='conflict'))report.status='attention';
      this.report=report;if(!options.dryRun){await this.persist();await this.write('status.json',report);}
      return report;
    }finally{this.running=false;}
  }
  async enabled(value) {
    if (this.changingLibrary) throw new Error('Warte, bis der Datenordner gespeichert ist.');
    this.changingLibrary = true;
    try {
      const config = {...this.config, enabled: !!value};
      await this.write('config.json', config);
      this.config = config;
      return config.enabled;
    } finally {
      this.changingLibrary = false;
    }
  }
  notifyConflict(){try{const p=new Zotero.ProgressWindow({closeOnClick:true});p.changeHeadline('TextFold → Zotero');p.addDescription('Eine in Zotero bearbeitete Übertragung wurde geschützt und nicht überschrieben. Details: Werkzeuge → TextFold → Zotero → Status anzeigen.');p.show();p.startCloseTimer(8000);}catch(e){Zotero.debug('TextFold sync conflict: '+e.message);}}
  describe(){
    const entries=Object.values(this.state.entries),issues=Object.values(this.state.issues);
    return ['Automatische Übertragung: '+(this.config.enabled?'ein':'aus'),
      'TextFold-Datenordner: '+(this.libraryRoot || 'nicht konfiguriert'),
      ...(this.report.status === 'waiting-for-textfold' ? ['TextFold-Daten fehlen. Öffne TextFold oder wähle den Datenordner mit „papers“.'] : []),
      'Letzte Prüfung: '+(this.report.time?new Date(this.report.time).toLocaleString():'noch keine'),
      'Zugeordnete PDF-Anmerkungen: '+entries.filter(e=>e.kind==='annotation').length,
      'Zugeordnete Zotero-Notizen: '+entries.filter(e=>e.kind==='note').length,
      'Geschützte Änderungen in Zotero: '+issues.filter(i=>i.type==='conflict').length,
      'In Zotero entfernt, keine Neuanlage: '+issues.filter(i=>i.type==='deleted').length,
      ...issues.filter(i=>i.type==='conflict').map(i=>i.title+': '+i.reason),
      ...(this.report.errors||[]).map(e=>'Hinweis: '+e.error)].join('\n\n');
  }
  addMenu(window) {
    const doc=window.document,parent=doc.getElementById('menu_ToolsPopup');if(!parent||doc.getElementById('textfold-sync-menu'))return;
    const menu=doc.createXULElement('menu');menu.id='textfold-sync-menu';menu.setAttribute('label','TextFold → Zotero');
    const popup=doc.createXULElement('menupopup');
    for(const [label,callback] of [
      ['Jetzt übertragen',async()=>{await this.sync({manual:true});window.alert(this.describe());}],
      ['Status anzeigen',()=>window.alert(this.describe())],
      ['TextFold-Datenordner auswählen…', () => this.chooseLibrary(window)],
      ['TextFold-Standardordner verwenden', async () => {await this.saveLibraryRoot(null);window.alert(this.describe());}],
      ['Automatische Übertragung ein/aus',async()=>window.alert('Automatische Übertragung: '+(await this.enabled(!this.config.enabled)?'ein':'aus'))]
    ]){const item=doc.createXULElement('menuitem');item.setAttribute('label',label);item.addEventListener('command',()=>Promise.resolve(callback()).catch(e=>window.alert(e.message)));popup.append(item);}
    menu.append(popup);parent.append(menu);
  }
  removeMenu(window){window.document.getElementById('textfold-sync-menu')?.remove();}
};
