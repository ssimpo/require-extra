'use strict';

const config = require('./config');
const _eval = require('./eval');
const requireLike = require('require-like');
const Resolver = require('./resolver');
const cache = require('./cache');
const Module = require('./Module');
const path = require('path');
const {isString, readFile, readFileSync, getCallingDir, promisify} = require('./util');
const xIsJson = /\.json$/;
const xIsJsonOrNode = /\.(?:json|node)$/;


/**
 * Get the resolver object from a given object.  Assumes it has received
 * either an actual resolver or an options object with resolver in it.  If this
 * is not true then return the default resolver.
 *
 * @private
 * @param {Object} obj    Object to get resolver from.
 * @returns {Object}      The resolver object.
 */
function _getResolve(obj) {
  if (!obj) return config.get('resolver');
  if (obj instanceof Resolver) return obj;
  if (obj.resolver) return obj.resolver;
  let pass = true;
  Resolver.resolveLike.forEach(property=>{pass &= (property in obj);});
  if (pass) return obj;
  return new Resolver(obj);
}

/**
 * Get the root directory to use from the supplied object or calculate it.
 *
 * @private
 * @param {Object} obj    The options object containing a 'dir' property.
 * @returns {string}      The directory path.
 */
function _getRoot(obj) {
  return (getCallingDir(((obj && obj.basedir) ? obj.basedir : undefined)) || (obj?obj.basedir:undefined));
}

/**
 * Resolve a module path starting from current directory via returned promise.
 *
 * @public
 * @param {Object} [userResolver=config.get('resolver')]    User-created resolver function.
 * @param {string} moduleName                               Module name or path (same format as supplied to require()).
 * @returns {Promise.<string>}
 */
function resolveModulePath(userResolver, moduleName) {
  [moduleName, userResolver] = [moduleName || userResolver, userResolver || config.get('resolver')];
  let dir = _getRoot(userResolver);
  return _getResolve(userResolver).resolve(moduleName, dir);
}

/**
 * Resolve a module path starting from current directory via returned promise.
 *
 * @public
 * @param {Object} [userResolver=config.get('resolver')]    User-created resolver function.
 * @param {string} moduleName                               Module name or path (same format as supplied to require()).
 * @returns {Promise.<string>}
 */
function resolveModulePathSync(userResolver, moduleName) {
  [moduleName, userResolver] = [moduleName || userResolver, userResolver || config.get('resolver')];
  let dir = _getRoot(userResolver);
  return _getResolve(userResolver).resolveSync(moduleName, dir);
}

/**
 * Read text from a file and handle any errors.
 *
 * @private
 * @param {string} fileName
 * @param {boolean} [sync=false]
 * @returns {Promise.<string>|string}
 */
function _loadModuleText(fileName, sync=false) {
  return sync?readFileSync(fileName, 'utf-8'):readFile(fileName, 'utf8');
}

/**
 * Evaluate module text in similar fashion to require evaluations.
 *
 * @private
 * @param {string} filename   The path of the evaluated module.
 * @param {string} content   The text content of the module.
 * @returns {*}
 */
function _evalModuleText(filename, content, userResolver) {
  if (content === undefined) return;

  const moduleConfig = _createModuleConfig(filename, content, userResolver);
  if (xIsJsonOrNode.test(filename)) {
    const time = process.hrtime();
    const module = new Module(moduleConfig);

    if (xIsJson.test(filename)) {
      module.exports = JSON.parse(content);
    } else {
      module.exports = process.dlopen(module, filename);
    }

    module.loaded = true;
    const diff = process.hrtime(time);
    const ms = parseInt((diff[0] * 1000) + (diff[1] / 1000000), 10);

    console.log(`${cache.size} ${ms+'ms'} ${filename}`);
    return module;
  } else {
    return _eval(moduleConfig);
  }
}

function _createModuleConfig(filename, content, userResolver) {
  return Object.assign({
    content,
    filename,
    includeGlobals:true,
    syncRequire,
    resolveModulePath,
    basedir: path.dirname(filename)
  }, userResolver.export);
}

/**
 * Load and evaluate a module returning undefined to promise resolve
 * on failure.
 *
 * @private
 * @param {string} filename   The path of the evaluated module.
 * @returns {Promise.<*>}
 */
async function _loadModule(filename, userResolver) {
  if (!cache.has(filename)) {
    cache.set(filename, _evalModuleText(filename, await _loadModuleText(filename), userResolver));
  }
  return cache.get(filename).exports;
}

/**
 * Load and evaluate a module returning undefined to promise resolve
 * on failure.
 *
 * @private
 * @param {string} filename   The path of the evaluated module.
 * @returns {*}
 */
function _loadModuleSync(filename, userResolver) {
  if (!cache.has(filename)) {
    cache.set(filename, _evalModuleText(filename, _loadModuleText(filename, true), userResolver));
  }
  return cache.get(filename).exports;
}

/**
 * This is a sychronous version of loadModule.  The module is still resolved
 * using async methods but the actual loading is done using the native require
 * from node.
 *
 * Load and evaluate a module returning undefined to promise resolve
 * on failure.
 *
 * @private
 * @param {string} modulePath   The path of the evaluated module.
 * @returns {*}
 */
async function _loadModuleSyncAsync(modulePath, userResolver) {
  const localRequire = requireLike(userResolver.parent || config.get('parent').filename);
  await promisify(setImmediate)();
  return localRequire(modulePath);
}

/**
 * Load a module
 *
 * @private
 * @param {Object} userResolver         User-created resolver function.
 * @param {string} moduleName           Module name or path, same format as for require().
 * @param {boolean} useSyncResolve      Whether to use the native node require function (sychronous) or the require
 *                                      function from this module, which is async.
 * @returns {Promise.<*|undefined>}     The module or undefined.
 */
async function _loader(userResolver, moduleName, useSyncResolve) {
  const modulePath = await resolveModulePath(userResolver, moduleName);
  return (useSyncResolve?_loadModuleSyncAsync:_loadModule)(modulePath, userResolver);
}

/**
 * Load a module asynchronously, this is an async version of require().  Will
 * load a collection of modules if an array is supplied.  Will reject if module
 * is not found or on error.
 *
 * @private
 * @param {Object} userResolver                 User-created resolver function or an options object.
 * @param {string|Array} moduleName             Module name or path (or array of either), same format as for require().
 * @param {function} [callback]                 Node-style callback to use instead of (or as well as) returned promise.
 * @param {boolean} [useSyncResolve=false]      Whether to use the native node require function (sychronous) or the
 *                                              require function from this module, which is async.
 * @returns {Promise.<*|undefined>}             Promise, resolved with the module(s) or undefined.
 */
async function _requireX(userResolver, moduleName, callback, useSyncResolve=false) {
  if (userResolver.dir) {
    console.warn(`The property userResolver.dir is deprecated, please use userResolver.basedir instead. This being used in ${getCallingFileName()}`);
  }

  userResolver.basedir = userResolver.basedir || userResolver.dir;

  try {
    const modules = await (Array.isArray(moduleName) ?
        Promise.all(moduleName.map(moduleName=>_loader(userResolver, moduleName, useSyncResolve))) :
        _loader(userResolver, moduleName, useSyncResolve)
    );

    if (!callback) return modules;
    setImmediate(()=>callback(null, modules));
  } catch (err) {
    if (!callback) return Promise.reject(err);
    setImmediate(()=>callback(err, undefined));
  }
}

/**
 * Load a module asynchronously, this is an async version of require().  Will load a collection of modules if an array
 * is supplied.  Will reject if module is not found or on error.
 *
 * This version still uses the native require() from node but resolves the path using async methodology.
 *
 * @public
 * @param {Object} [userResolver=config.get('resolver')]      User-created resolver function or an options object.
 * @param {string|Array} moduleName                           Module name or path (or array of either), same format
 *                                                            as for require().
 * @param {function} [callback]                               Node-style callback to use instead of (or as well as)
 *                                                            returned promise.
 * @returns {Promise.<*>}                                     Promise, resolved with the module(s) or undefined.
 */
function requireSync(userResolver, moduleName, callback) {
  return _requireX(..._parseRequireParams([userResolver, moduleName, callback], true));
}

/**
 * Load a module asynchronously, this is an async version of require().  Will load a collection of modules if an array
 * is supplied.  Will reject if module is not found or on error.
 *
 * @public
 * @param {Object} [userResolver=config.get('resolver')]      User-created resolver function or an options object.
 * @param {string|Array} moduleName                           Module name or path (or array of either), same format as
 *                                                            for require().
 * @param {function} [callback]                               Node-style callback to use instead of (or as well as) returned promise.
 * @returns {Promise.<*>}                                     Promise, resolved with the module(s) or undefined.
 */
function requireAsync(userResolver, moduleName, callback) {
  return _requireX(..._parseRequireParams([userResolver, moduleName, callback]));
}

function _parseRequireParams([userResolver, moduleName, callback], useSyncResolve=false) {
  if(isString(userResolver) || Array.isArray(userResolver)) {
    return [config.get('resolver'), userResolver, moduleName, useSyncResolve];
  }else {
    return [_getResolve(userResolver), moduleName, callback, useSyncResolve];
  }
}

function syncRequire(...params) {
  const [userResolver, moduleName] = _parseRequireParams(params);
  if (userResolver.isCoreModule(moduleName)) return __require(moduleName);
  userResolver.basedir = userResolver.basedir || userResolver.dir;
  const filename = resolveModulePathSync(userResolver, moduleName, true);
  return _loadModuleSync(filename, userResolver);
}

module.exports = {
  requireAsync, requireSync, resolveModulePath, syncRequire
};