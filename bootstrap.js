var scope;
function install() {}
function uninstall() {}
async function startup({rootURI}) {
  await Zotero.initializationPromise;
  const timers = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
  const { FilePicker } = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');
  scope = {Zotero, IOUtils, PathUtils, Services, TextDecoder, URL,
    FilePicker,
    platform: Services.appinfo.OS,
    homeDir: Services.appinfo.OS === 'Darwin' ? Services.dirsvc.get('Home', Ci.nsIFile).path : '',
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout};
  Services.scriptloader.loadSubScript(rootURI + 'core.js', scope);
  Services.scriptloader.loadSubScript(rootURI + 'sync.js', scope);
  await scope.TextFoldZoteroSync.start();
  Zotero.TextFoldZoteroSync = scope.TextFoldZoteroSync;
  for (const window of Zotero.getMainWindows()) scope.TextFoldZoteroSync.addMenu(window);
}
function onMainWindowLoad({window}) { scope?.TextFoldZoteroSync.addMenu(window); }
function onMainWindowUnload({window}) { scope?.TextFoldZoteroSync.removeMenu(window); }
async function shutdown() {
  await scope?.TextFoldZoteroSync.stop();
  for (const window of Zotero.getMainWindows()) scope?.TextFoldZoteroSync.removeMenu(window);
  delete Zotero.TextFoldZoteroSync;
  scope = null;
}
