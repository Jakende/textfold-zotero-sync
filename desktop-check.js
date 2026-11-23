function install() {}
function uninstall() {}
function shutdown() {}

async function startup() {
  const timers = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
  const directory = PathUtils.parent(PathUtils.profileDir);
  const resultPath = PathUtils.join(directory, 'result.json');
  try {
    await Zotero.initializationPromise;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (Zotero.TextFoldZoteroSync && Zotero.getMainWindow()?.Zotero_Tabs) break;
      await new Promise(resolve => timers.setTimeout(resolve, 500));
    }
    const service = Zotero.TextFoldZoteroSync;
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    check(service?.libraryRoot === Services.env.get('TEXTFOLD_DATA'), 'Add-on did not start in the test profile');
    const paper = 'desktop-fixture';
    const text = 'A unique scientific passage for the desktop annotation test.';
    const note = {id:'n-fixture', kind:'note', anchor:{quote:{exact:text}}, text:'Wissenschaftlicher Kommentar'};
    const paperDir = PathUtils.join(service.papers, paper);
    await IOUtils.makeDirectory(paperDir, {createAncestors:true});
    const fixture = PathUtils.join(paperDir, 'source.pdf');
    await IOUtils.copy(PathUtils.join(directory, 'fixture.pdf'), fixture);
    const item = new Zotero.Item('journalArticle');
    item.setField('title', 'Desktop annotation test');
    await item.saveTx();
    const pdf = await Zotero.Attachments.importFromFile({file:fixture, parentItemID:item.id});
    const write = (file, value) => IOUtils.writeUTF8(PathUtils.join(paperDir, file), JSON.stringify(value));
    await write('meta.json', {zotero:{library:'users/0', item:item.key}});
    await write('notes.json', {format:'textfold/notes', version:1, paper:{id:paper}, notes:[note]});
    const sync = async expected => {
      const report = await service.sync({manual:true});
      check(report.status==='ok' && report.results.length===1 && report.results[0].result===expected,
        JSON.stringify(report));
      return report.results[0];
    };
    const created = await sync('created');
    check(created.kind==='annotation', JSON.stringify(created));
    const annotation = Zotero.Items.getByLibraryAndKey(item.libraryID, created.key);
    check(annotation.annotationComment === note.text && annotation.getTags().length === 0,
      'New PDF annotation contains generated metadata');
    check(annotation.annotationText === text && annotation.parentKey === pdf.key, 'Wrong passage or PDF');

    const entry = service.state.entries[created.uri];
    annotation.annotationComment = 'TextFold\n\n' + note.text + '\n\nZurück zu TextFold: ' + created.uri;
    annotation.setTags([{tag:'TextFold'}, {tag:'Methode'}]);
    await annotation.saveTx();
    entry.source = service.hash(service.core.sourceSignature(note));
    entry.target = service.hash(service.itemState(annotation));
    const updated = await sync('updated');
    check(updated.key === created.key && pdf.getAnnotations().length === 1, 'Duplicate PDF annotation');
    check(annotation.annotationComment === note.text && annotation.getTags().map(t => t.tag).join() === 'Methode',
      'Earlier annotation was not cleaned in place');
    await sync('unchanged');

    annotation.annotationComment = 'In Zotero bearbeitet';
    await annotation.saveTx();
    await sync('conflict');
    check(annotation.annotationComment === 'In Zotero bearbeitet', 'Manual edit was overwritten');
    await IOUtils.writeUTF8(resultPath, JSON.stringify({passed:true, os:Services.appinfo.OS, zotero:Zotero.version}));
  } catch (error) {
    await IOUtils.writeUTF8(resultPath, JSON.stringify({passed:false, error:String(error), stack:error.stack}));
  }
}
