/*global ffos: true*/
/*global SERVER, MANIFEST, CACHE, util*/
/*global Promise, URL, caches, fetch*/
/*jshint camelcase: false*/
//jscs:disable requireCamelCaseOrUpperCaseIdentifiers

ffos =
(function () {
"use strict";

var tempZipCache = {},
	tempZipLru = [],
	tempZipLruLength = 5,
	tempMetadataCache = {},
	cachedRe;

function isValidManifestUrl (url) {
	return url.endsWith('.webapp') &&
		!(
			url.startsWith(SERVER + '/') && url.endsWith('/' + MANIFEST) &&
			(/^[a-z\-]+$/.test(url.slice(SERVER.length + 1, -MANIFEST.length - 1)))
		);
}

function isValidUrl (url, manifest) {
	var parsedUrl;
	try {
		parsedUrl = new URL(url);
		return (
			parsedUrl.hash === '' &&
			parsedUrl.href === url &&
			(!manifest || isValidManifestUrl(url))
		);
	} catch (e) {
		return false;
	}
}

function getIdType (id) {
	if (/^[a-z\-]+$/.test(id)) {
		return 'basic';
	}
	if (/^file@[a-zA-Z0-9\-_]+$/.test(id)) {
		return isValidUrl(util.aToU(id.slice(5))) && 'file';
	}
	if (/^url@[a-zA-Z0-9\-_]+$/.test(id)) {
		return isValidUrl(util.aToU(id.slice(4)), true) && 'url';
	}
	return false;
}

function getMiniManifestUrl (id) {
	var type = getIdType(id);
	if (!type) {
		throw new Error('Invalid id');
	}
	if (type === 'url') {
		return util.aToU(id.slice(4));
	}
	return SERVER + '/' + id + '/' + MANIFEST;
}

function openCache () {
	return caches.open(CACHE);
}

function fetchFile (url, noCache) {
	if (noCache) {
		return fetch(url);
	}
	return openCache().then(function (cache) {
		return cache.match(url).then(function (response) {
			return response || fetch(url);
		});
	});
}

function getMiniManifest (id) {
	var url = getMiniManifestUrl(id);
	return fetchFile(url);
}

function getZipUrl (id) {
	return getMiniManifest(id).then(function (manifest) {
		return manifest.json();
	}).then(function (manifest) {
		return String(new URL(manifest.package_path, getMiniManifestUrl(id)));
	});
}

function getZipBlob (id) {
	return getZipUrl(id).then(function (url) {
		return fetchFile(url);
	});
}

function createZipPromise (id) {
	return getZipBlob(id).then(function (response) {
		return response.arrayBuffer();
	}).then(util.zip.createReader);
}

function getZip (id) {
	if (!tempZipCache[id]) {
		tempZipCache[id] = createZipPromise(id);
	}
	tempZipLru = tempZipLru.filter(function (entry) {
		return entry !== id;
	});
	tempZipLru.push(id);
	while (tempZipLru.length > tempZipLruLength) {
		delete tempZipCache[tempZipLru.shift()];
	}
	return tempZipCache[id];
}

function createMetadataPromise (id) {
	return getFile(id, 'manifest.webapp').then(function (manifest) {
		return manifest.json();
	});
}

function getMetadata (id) {
	if (!tempMetadataCache[id]) {
		tempMetadataCache[id] = createMetadataPromise(id);
	}
	return tempMetadataCache[id];
}

function getRootUrl (id) {
	return getMetadata(id).then(function (manifest) {
		return util.dropAbsolutePath(manifest.launch_path);
	});
}

function getLinkMetaRe () {
	var link, meta;
	if (!cachedRe) {
		link = [
			'apple-touch-icon',
			'mask-icon',
			'shortcut icon',
			'icon',
			'manifest'
		];
		meta = [
			'msapplication-TileColor',
			'msapplication-config',
			'theme-color',
			'apple-mobile-web-app-title',
			'application-name'
		];
		link = 'link rel="(?:' + link.join('|') + ')';
		meta = 'meta name="(?:' + meta.join('|') + ')';
		cachedRe = new RegExp('<(?:' + link + '|' + meta + ')"[^<>]*>\\s*', 'g');
	}
	return cachedRe;
}

function fixRootFile (id, html) {
	return getMetadata(id).then(function (manifest) {
		var icons;
		icons = util.getIcons(manifest.icons).map(function (icon) {
			return '<link rel="icon" type="' + icon.type + '" sizes="' + icon.sizes +
				'" href="' + util.htmlEscape(icon.src) + '">';
		});
		icons.push('<meta name="apple-mobile-web-app-title" content="' + util.htmlEscape(manifest.name) + '">');
		icons.push('<meta name="application-name" content="' + util.htmlEscape(manifest.name) + '">');
		icons.push('<link rel="manifest" href="manifest.json">');
		icons.unshift('<!--Icons are added automagically, original HTML file differs a bit-->');
		return html
			.replace(/<script>[^<>]*serviceWorker[^<>]*<\/script>\s*/, '')
			.replace(getLinkMetaRe(), '')
			.replace(/(<meta charset=[^<>]*>)/, '$1\n' + icons.join('\n'));
	});
}

function getRootFile (id, path) {
	return getZip(id).then(function (zip) {
		return util.zip.extractFile(zip, path, true).then(function (html) {
			return fixRootFile(id, html).then(function (html) {
				return util.getResponse(html, util.getContentType('html'));
			});
		});
	});
}

function isSpecialPath (path) {
	return ['manifest.json', 'zip-content.html'].indexOf(path) > -1;
}

function getLocalisedData (manifest, langs) {
	var i, lang;
	if (manifest.locales) {
		for (i = 0; i < langs.length; i++) { //TODO also try to drop suffixes?
			lang = langs[i];
			if (manifest.locales[lang]) {
				return {
					lang: lang,
					name: manifest.locales[lang].name || manifest.name,
					description: manifest.locales[lang].description || manifest.description,
					developer: manifest.locales[lang].developer || manifest.developer
				};
			}
			if (lang === manifest.default_locale) {
				break;
			}
		}
	}
	return {
		lang: manifest.default_locale,
		name: manifest.name,
		description: manifest.description,
		developer: manifest.developer
	};
}

function getManifestJson (id) {
	return getMetadata(id).then(function (manifest) {
		var l10n, data;
		l10n = getLocalisedData(manifest, navigator.languages);
		data = {
			lang: l10n.lang,
			name: l10n.name,
			description: l10n.description,
			icons: util.getIcons(manifest.icons),
			display: manifest.chrome && manifest.chrome.navigation ? 'minimal-ui' :
				(manifest.fullscreen ? 'fullscreen' : 'standalone')
		};
		if (l10n.developer) {
			//Suggested in https://github.com/w3c/manifest-app-info/pull/47
			data.publisher = {
				name: l10n.developer.name,
				url: l10n.developer.url
			};
		}
		if (manifest.orientation) {
			data.orientation = manifest.orientation;
		}
		return util.getResponse(JSON.stringify(data), util.getContentType('json'));
	});
}

function getZipContentHtml (id) {
	return getZip(id).then(util.zip.getContent).then(function (files) {
		var currentFolder = '/',
			html = [],
			i, pos, folder, name;

		files = files.map(function (entry) {
			//prepend / if necessary
			if (entry.charAt(0) === '/') {
				return entry;
			}
			return '/' + entry;
		}).filter(function (entry) {
			//drop directories
			return entry.slice(-1) !== '/';
		}).sort(function (a, b) {
			//sort directories before files
			a = a.split('/');
			b = b.split('/');
			while (a[0] === b[0]) {
				a.shift();
				b.shift();
			}
			if (a.length === 1 && b.length === 1) {
				return a[0] < b[0] ? -1 : 1;
			} else if (a.length === 1) { /* && b.length > 1 */
				return 1;
			} else if (b.length === 1) { /* && a.length > 1 */
				return -1;
			} else { /* a.length > 1 && b.length > 1 */
				return a[0] < b[0] ? -1 : 1;
			}
		});

		function changeFolder (from, to) {
			var equal = 0, i;
			from = from.split('/');
			to = to.split('/');
			while (from[equal] === to[equal]) {
				equal++;
			}
			for (i = equal; i < from.length - 1; i++) {
				html.push('</ul></li>');
			}
			for (i = equal; i < to.length - 1; i++) {
				//TODO allow open/close?
				html.push('<li class="folder">' + util.htmlEscape(to[i]) + '/<ul>');
			}
		}

		for (i = 0; i < files.length; i++) {
			pos = files[i].lastIndexOf('/');
			folder = files[i].slice(0, pos + 1);
			name = files[i].slice(pos + 1);
			if (folder !== currentFolder) {
				changeFolder(currentFolder, folder);
				currentFolder = folder;
			}
			html.push('<li><a href="' + util.htmlEscape(files[i].slice(1)) + '">' + util.htmlEscape(name) + '</a></li>');
		}
		if (currentFolder !== '/') {
			changeFolder(currentFolder, '/');
		}

		html.unshift(
			'<!DOCTYPE html>',
			'<html><head>',
			'<meta charset="utf-8">',
			'<title>Content of ' + id + '.zip</title>',
			'<style>',
				'html {',
					'font: 16px/1.8 monospace;',
				'}',
				'li {',
					'list-style: none;',
				'}',
				'li::before {',
					'content: "🗋 ";',
				'}',
				'li.folder::before {',
					'content: "🗁 ";',
				'}',
			'</style>',
			'</head><body>',
			'<ul>'
		);
		html.push(
			'</ul>',
			'</body></html>'
		);
		return util.getResponse(html.join('\n'), util.getContentType('html'));
	});
}

function getSpecialFile (id, path) {
	if (path === 'manifest.json') {
		return getManifestJson(id);
	}
	if (path === 'zip-content.html') {
		return getZipContentHtml(id);
	}
	throw new Error('This shouldn’t happen');
}

function getFileOrRoot (id, path) {
	return getRootUrl(id).then(function (root) {
		if (path === '' || path === root) {
			return getRootFile(id, root);
		}
		return getFile(id, path, true);
	});
}

function getFile (id, path, noRoot) {
	if (isSpecialPath(path)) {
		return getSpecialFile(id, path);
	}
	if (!(noRoot || path === 'manifest.webapp')) {
		return getFileOrRoot(id, path);
	}
	return getZip(id).then(function (zip) {
		return util.zip.extractFile(zip, path);
	});
}

function createApp (id) {
	if (getIdType(id) !== 'file') {
		throw new Error('Invalid id');
	}
	return fetch(util.aToU(id.slice(5))).then(function (zipResponse) {
		var zipUrl = SERVER + '/' + id + '/app.zip',
			miniManifest = { //since we ignore all other data anyway
				package_path: zipUrl
			};
		return {
			miniManifest: util.getResponse(JSON.stringify(miniManifest), util.getContentType('webapp')),
			zipUrl: zipUrl,
			zip: zipResponse
		};
	});
}

function install (urlOrId) {
	var id, file;
	if (isValidUrl(urlOrId, true)) {
		id = 'url@' + util.uToA(urlOrId);
	} else if (isValidUrl(urlOrId)) {
		id = 'file@' + util.uToA(urlOrId);
		file = true;
	} else if (getIdType(urlOrId) === 'basic') {
		id = urlOrId;
	}
	if (!id) {
		throw new Error('Invalid id');
	}
	if (file) {
		return installFromFile(id);
	}
	return openCache().then(function (cache) {
		return cache.add(getMiniManifestUrl(id)).then(function () {
			return getZipUrl(id).then(function (url) {
				return cache.add(url).then(function () {
					return id;
				});
			});
		});
	});
}

function installFromFile (id) {
	return openCache().then(function (cache) {
		return createApp(id).then(function (app) {
			return cache.put(getMiniManifestUrl(id), app.miniManifest).then(function () {
				return cache.put(app.zipUrl, app.zip).then(function () {
					return id;
				});
			});
		});
	});
}

function update (id) {
	return install(id).then(function () {
		tempZipLru = tempZipLru.filter(function (entry) {
			return entry !== id;
		});
		if (tempZipCache[id]) {
			delete tempZipCache[id];
		}
		if (tempMetadataCache[id]) {
			delete tempMetadataCache[id];
		}
		return id;
	});
}

function uninstall (id) {
	return openCache().then(function (cache) {
		return getZipUrl(id).then(function (url) {
			return cache.delete(url).then(function () {
				return cache.delete(getMiniManifestUrl(id));
			});
		});
	});
}

function checkInstalled (id) {
	return openCache().then(function (cache) {
		return cache.match(getMiniManifestUrl(id)).then(function (response) {
			return !!response;
		});
	});
}

function checkUpdate (id) {
	if (getIdType(id) === 'file') {
		return Promise.resolve(false);
	}
	return fetchFile(getMiniManifestUrl(id), true).then(function (manifest) {
		return manifest.text();
	}).then(function (newManifest) {
		return fetchFile(getMiniManifestUrl(id)).then(function (manifest) {
			return manifest.text();
		}).then(function (oldManifest) {
			if (oldManifest !== newManifest) {
				return JSON.parse(newManifest).size || true; //return size of update
			} else {
				return false;
			}
		});
	});
}

function isMiniManifestUrl (url) {
	return url.endsWith('.webapp');
}

function getIdFromUrl (url) {
	if (
		url.startsWith(SERVER + '/') &&
		url.endsWith('/' + MANIFEST)
	) {
		return url.slice(SERVER.length + 1, -MANIFEST.length - 1);
	}
	return 'url@' + util.uToA(url);
}

function getList () {
	return openCache().then(function (cache) {
		return cache.keys().then(function (keys) {
			return keys.map(function (response) {
				return response.url;
			}).filter(isMiniManifestUrl).map(getIdFromUrl);
		});
	});
}

function getUpdates () {
	return getList().then(function (list) {
		return Promise.all(list.map(function (app) {
			return checkUpdate(app).then(function (hasUpdate) {
				if (hasUpdate) {
					return {
						name: app,
						size: hasUpdate === true ? 0 : hasUpdate
					};
				}
			}, function () {
				return false;
			});
		})).then(function (list) {
			return list.filter(function (app) {
				return app;
			});
		});
	});
}

function getOption (key) {
	return openCache().then(function (cache) {
		return cache.match(SERVER + '/.options/' + key).then(function (response) {
			return response || util.getResponse('', util.getContentType('txt'));
		});
	});
}

function setOption (key, val) {
	return openCache().then(function (cache) {
		return cache.put(SERVER + '/.options/' + key, util.getResponse(val, util.getContentType('txt'))).then(function () {
			return util.getResponse('', util.getContentType('txt'));
		});
	});
}

return {
	getIdType: getIdType,
	getFile: getFile,
	install: install,
	update: update,
	uninstall: uninstall,
	checkInstalled: checkInstalled,
	checkUpdate: checkUpdate,
	getList: getList,
	getUpdates: getUpdates,
	options: {
		get: getOption,
		set: setOption
	}
};

})();
