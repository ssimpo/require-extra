'use strict';

const path = require('path');
const config = require('./config');
const {requireAsync, requireSync} = require('./require');
const {
  isFunction, intersection, uniq, readDir, makeArray, flattenDeep,
  getCallingFileName, getCallingDir
} = require('./util');

/**
 * Get a list of files in the directory.
 *
 * @private
 * @param {string} dirPath          Directory path to scan.
 * @param {Object} [options]        Import options object.
 * @returns {Promise.<string[]>}    Promise resolving to array of files.
 */
async function _filesInDirectory(dirPath, options) {
  const basedir = options.basedir || getCallingDir();
  const resolvedDirPath = basedir?path.resolve(basedir, dirPath):dirPath;
  let xExt = _getExtensionRegEx(options.extension || config.get('extensions'));

  try {
    return (await readDir(resolvedDirPath)).filter(
      fileName=>xExt.test(fileName)
    ).map(
      fileName=>path.resolve(resolvedDirPath, fileName)
    );
  } catch (err) {
    return [];
  }
}

async function filesInDirectories(dirPaths, options) {
  let files = await Promise.all(dirPaths.map(dirPath=>_filesInDirectory(dirPath, options)));
  return flattenDeep(files);
}

/**
 * Take a file path and return the filename (without an extension).  Possible
 * extensions are passed in or the module default is used.
 *
 * @private
 * @param {string} filePath                               File path to get filename from.
 * @param {Array|string} [ext=config.get('extensions')]   File extension(s) to remove.
 * @returns {string}                                      The filename without given extension(s).
 */
function _getFileName(filePath, ext=config.get('extensions')) {
  return path.basename(filePath).replace(_getExtensionRegEx(ext), '');
}

/**
 * Get a regular expression for the given selection of file extensions, which
 * will then be able to match file paths, which have those extensions.
 *
 * @private
 * @param {Array|string} [ext=config.get('extensions')]     The extension(s).
 * @returns {RegExp}                                        File path matcher.
 */
function _getExtensionRegEx(ext=config.get('extensions')) {
  let _ext = '(?:' + makeArray(ext).join('|') + ')';
  return new RegExp(_ext + '$');
}

/**
 * Get the extension names for a given filename
 *
 * @private
 * @param {string} fileName   The filename to get the extension of.
 * @param {Object} [options]  Options containing the file extension (or not).
 * @returns {Array}
 */
function _getFileTests(fileName, options={}) {
  let extension =  makeArray(options.extension || config.get('extensions'));
  return uniq(
    [path.basename(fileName)].concat(
      extension.map(ext=>path.basename(fileName, ext)
      )
    )
  ).filter(value=>value);
}

/**
 * Can a filename be imported according to the rules the supplied options.
 *
 * @private
 * @param {string} fileName         Filename to test.
 * @param {string} callingFileName  Calling filename (file doing the import).
 * @param {Object} options          Import/Export options.
 * @returns {boolean}
 */
function _canImport(fileName, callingFileName, options) {
  if (callingFileName && (fileName === callingFileName)) return false;
  let _fileName = _getFileTests(fileName, options);
  if (options.includes) return (intersection(options.includes, _fileName).length > 0);
  if (options.excludes) return (intersection(options.includes, _fileName).length === 0);
  return true;
}

/**
 * Import an entire directory (excluding the file that does the import if it is in the same directory).
 *
 * @async
 * @param {string} dirPath                                               Directory to import.
 * @param {Object} [options]                                            Import options.
 * @param {Array|string} [options.extension=config.get('extensions')]   Extension of files to import.
 * @param {Object} [options.imports={}]                                 Object to import into.
 * @param {Function} [options.onload]                                   Callback to fire on each successful import.
 * @param {boolean} [options.merge=false]                               Merge exported properties & methods together.
 * @returns {Promise.<Object>}
 */
async function _importDirectory(dirPath, options={}) {
  const _options = _importDirectoryOptionsParser(options);
  const modDefs = await _importDirectoryModules(dirPath, _options);

  modDefs.forEach(([fileName, module])=>{
    if (_options.onload) _options.onload(fileName, module);
    if ((_options.merge === true) && (!isFunction(module))) return Object.assign(_options.imports, module);
    _options.imports[_getFileName(fileName, _options.extension)] = module;
  });

  return _options.imports;
}

/**
 * Parse the input options, filling-in any defaults.
 *
 * @private
 * @param {Object} [options={}]   The options to parse.
 * @returns {Object}
 */
function _importDirectoryOptionsParser(options={}) {
  const _options = Object.assign({
    imports: {},
    onload: options.callback,
    extension: config.get('extensions')
  }, options, {
    useSyncRequire: !!options.useSyncRequire,
    merge: !!options.merge
  });

  if (options.callback) console.warn(`The options.callback method is deprecated, please use options.onload() instead. This being used in ${getCallingFileName()}`);

  return _options;
}

/**
 * Take a directory path(s) and pull-in all modules returning an array with the filename as the first item
 * and module as the second
 *
 * @private
 * @async
 * @param {string|Array.<string>} dirPath     Directories to import.
 * @param {Object} options                    Import options.
 * @returns {Promise.<Array>}                 The module definitions.
 */
async function _importDirectoryModules(dirPath, options) {
  const caller = getCallingFileName();
  const require = (options.useSyncRequire ? requireSync : requireAsync);
  const files = await filesInDirectories(makeArray(dirPath), options);
  const modDefs = await Promise.all(files.map(async (fileName)=> {
    if (_canImport(fileName, caller, options)) return [fileName, await require(options, fileName)];
  }));

  return modDefs.filter(modDef=>modDef);
}

/**
 * Import all the modules in a set of given paths,according to the supplied options.
 *
 * @public
 * @param {string|Array.<string>} dirPath   The path(s) to import frpm.
 * @param {Object} [options='']             The option to use in the import.
 * @param {Function} [callback]             Node-style callback to fire, use if you do not want a promise.
 * @returns {Promise.<Object>}
 */
function importDirectory(dirPath, options, callback) {
  if (!callback) return _importDirectory(dirPath, options);
  _importDirectory(dirPath, options).then(
    imports=>setImmediate(()=>callback(null, imports)),
    err=>setImmediate(()=>callback(err, undefined))
  );
}


module.exports = importDirectory;