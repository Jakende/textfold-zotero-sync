const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');

const bootstrap = fs.readFileSync(path.join(__dirname, 'bootstrap.js'), 'utf8');
const platforms = {
  Darwin: {paths: path.posix, home: '/Users/Test User', root: '/Users/Test User/Library/Application Support/TextFold'},
  WINNT: {paths: path.win32, home: 'C:\\Users\\Test User', root: 'C:\\Users\\Test User\\AppData\\Local\\TextFold'},
};

function createHost(platform, {env = {}, config, available = []} = {}) {
  const {paths, home, root} = platforms[platform];
  const profile = paths.join(home, 'profile');
  const directory = paths.join(profile, 'textfold-zotero-sync');
  const files = new Map();
  if (config) files.set(paths.join(directory, 'config.json'), JSON.stringify(config));
  const Zotero = {initializationPromise: Promise.resolve(), getMainWindows: () => []};
  const requests = [];
  Zotero.HTTP = {request: async (_method, url) => {
    requests.push(url);
    return {responseText: '{"sections":[]}'};
  }};
  const nativeFolder = {file: null, outcome: 1};
  class FilePicker {
    modeGetFolder = 2;
    returnOK = 0;
    get file() { return nativeFolder.file; }
    init(_window, _title, mode) { assert.equal(mode, this.modeGetFolder); }
    async show() { return nativeFolder.outcome; }
  }
  const Services = {
    appinfo: {OS: platform},
    env: {get: name => env[name] || ''},
    dirsvc: {get: () => ({path: home})},
    scriptloader: {loadSubScript(name, target) {
      const filename = path.join(__dirname, name);
      if (!vm.isContext(target)) vm.createContext(target);
      vm.runInContext(fs.readFileSync(filename, 'utf8'), target, {filename});
    }},
  };
  const IOUtils = {
    makeDirectory: async () => {},
    readUTF8: async name => {
      if (!files.has(name)) throw Object.assign(new Error('Missing file'), {name:'NotFoundError'});
      return files.get(name);
    },
    writeUTF8: async (name, value) => {files.set(name, value);},
    exists: async name => available.includes(name),
    stat: async name => ({type: available.includes(name) ? 'directory' : 'regular'}),
    getChildren: async name => {
      assert(available.includes(name));
      return [];
    },
  };
  const context = vm.createContext({
    Zotero, IOUtils, PathUtils:{join:paths.join,profileDir:profile}, Services, TextDecoder, URL, Ci:{},
    ChromeUtils:{importESModule: path => path.endsWith('Timer.sys.mjs')
      ? {setTimeout: () => 1, clearTimeout: () => {}}
      : {FilePicker}},
  });
  vm.runInContext(bootstrap,context);
  return {async start() {await context.startup({rootURI:''});return Zotero.TextFoldZoteroSync;}, files, directory, root, paths, requests, nativeFolder, zotero:Zotero};
}

for (const [platform, {paths, root}] of Object.entries(platforms)) {
  test(platform + ' starts with the documented TextFold directory', async () => {
    const host = createHost(platform, {
      env: {LOCALAPPDATA:'C:\\Users\\Test User\\AppData\\Local'},
      available: [paths.join(root, 'papers')],
    });
    const service = await host.start();
    assert.equal(service.libraryRoot, root);
    assert.equal(service.config.enabled, false);
    assert.equal((await service.sync()).status, 'ok');
    host.files.set(paths.join(root, 'server.json'), '{"url":"http://127.0.0.1:31917"}');
    await service.document('example');
    assert.deepEqual(host.requests, ['http://127.0.0.1:31917/api/doc/example?lang=en']);
  });

  test(platform + ' refreshes only its own unchanged PDF annotation without creating a duplicate', async () => {
    const host = createHost(platform);
    const service = await host.start();
    const note = {id:'n-example', kind:'note', text:'Eigenes Memo'};
    const uri = service.core.uri('paper', note.id);
    const parent = {key:'PARENT', libraryID:1};
    const attachment = {key:'PDF'};
    const geometry = {text:'Original passage', position:{pageIndex:7, rects:[[0, 0, 10, 10]]}};
    const hash = value => createHash('md5').update(value).digest('hex');
    let saved;
    let item;
    let writes = 0;
    const {zotero} = host;
    zotero.Utilities = {Internal:{md5:hash}};
    zotero.Items = {getByLibraryAndKey: () => item};
    zotero.Annotations = {
      toJSONSync: () => saved,
      saveFromJSON: async (pdf, json) => {
        assert.equal(pdf, attachment);
        writes++;
        saved = json;
        item = {
          key:json.key, libraryID:1, parentKey:pdf.key, parentItem:pdf, isAnnotation:() => true,
          annotationPosition:JSON.stringify(json.position), annotationComment:json.comment,
          annotationText:json.text, annotationColor:json.color, getTags:() => json.tags,
          getRelations:() => ({}), toJSON:() => json,
        };
        return item;
      },
    };
    service.quotations = async () => ['Original passage'];
    service.locate = async () => geometry;
    const transfer = () => service.transfer('paper', {}, note, parent, {item:attachment});
    const created = await transfer();
    assert.equal(created.result, 'created');
    assert.equal(saved.comment, 'Eigenes Memo');
    assert.equal(saved.tags.length, 0);
    assert.equal((await transfer()).result, 'unchanged');

    // Reproduce a previously imported annotation and its original saved fingerprints.
    item.annotationComment = 'TextFold\n\nEigenes Memo\n\nZurück zu TextFold: ' + uri;
    saved.tags = [{name:'TextFold'}, {name:'Methode'}];
    const entry = service.state.entries[uri];
    entry.source = hash(service.core.sourceSignature(note));
    entry.target = hash(service.itemState(item));
    const migrated = await transfer();
    assert.equal(migrated.result, 'updated');
    assert.equal(migrated.key, created.key);
    assert.equal(saved.comment, 'Eigenes Memo');
    assert.equal(saved.tags.map(tag => tag.name).join(), 'Methode');
    assert.equal(saved.position.pageIndex, 7);
    assert.equal((await transfer()).result, 'unchanged');

    item.annotationComment = 'In Zotero bearbeitet';
    assert.equal((await transfer()).result, 'conflict');
    assert.equal(item.annotationComment, 'In Zotero bearbeitet');
    assert.equal(writes, 2);
  });
}

test('Windows without LOCALAPPDATA can configure a folder from the menu', async () => {
  const custom = 'D:\\Meine Literatur\\TextFold';
  const host = createHost('WINNT', {available: [path.win32.join(custom, 'papers')]});
  const service = await host.start();
  assert.equal((await service.sync()).status, 'waiting-for-textfold');
  assert.match(service.describe(), /TextFold-Daten fehlen/);
  await service.chooseLibrary({alert: () => assert.fail('cancelled picker')});
  assert.equal(service.libraryRoot, null);
  host.nativeFolder.outcome = 0;
  host.nativeFolder.file = 'D:\\Wrong directory';
  await assert.rejects(service.chooseLibrary({}), /Unterordner/);
  host.nativeFolder.file = custom;
  let confirmed = false;
  await service.chooseLibrary({alert: () => {confirmed = true;}});
  assert(confirmed);
  assert.equal(JSON.parse(host.files.get(host.paths.join(host.directory, 'config.json'))).libraryRoot, custom);
  assert.equal((await service.sync()).status, 'ok');
});

test('a stored folder overrides the environment, resetting restores TEXTFOLD_DATA', async () => {
  const host = createHost('WINNT', {
    config: {enabled: true, interval: 5000, libraryRoot: 'D:\\Selected'},
    env: {TEXTFOLD_DATA:'E:\\Environment'},
  });
  const service = await host.start();
  assert.equal(service.libraryRoot, 'D:\\Selected');
  service.files.set('paper', 'old');
  await service.saveLibraryRoot(null);
  assert.equal(service.libraryRoot, 'E:\\Environment');
  assert.equal(service.files.size, 0);
  assert.equal(service.config.enabled, true);
});
