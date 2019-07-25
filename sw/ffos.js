/*global ffos: true*/
/*global SERVER, CACHE, zip*/
/*global Response, Promise, URL, caches, fetch*/
ffos =
(function () {
"use strict";

var tempZipCache = {},
	tempMetadataCache = {},
	servedFromCache = {};

function dropAbsolutePath (path) {
	if (path.charAt(0) === '/') {
		path = path.slice(1);
	}
	return path;
}

function getIcons (data) {
	var icons = [], icon;
	for (icon in data) {
		icons.push({
			src: dropAbsolutePath(data[icon]),
			sizes: icon + 'x' + icon,
			type: 'image/png'
		});
	}
	return icons;
}

function getResponse (data, type) {
	return new Response(data, {
		headers: {
			'Content-Type': type
		}
	});
}

function getContentType (ext) {
	//TODO add missing types as needed
	return {
		css: 'text/css',
		gif: 'image/gif',
		htm: 'text/html',
		html: 'text/html',
		ico: 'image/x-icon',
		jpeg: 'image/jpeg',
		jpg: 'image/jpeg',
		js: 'text/javascript',
		json: 'application/json',
		mp3: 'audio/mpeg',
		mp4: 'video/mpeg4',
		oga: 'audio/ogg',
		ogg: 'audio/ogg',
		ogv: 'video/ogg',
		pdf: 'application/pdf',
		png: 'image/png',
		svg: 'image/svg+xml',
		webm: 'video/webm',
		woff: 'application/font-woff',
		xhtml: 'text/html',
		xml: 'text/xml',
		zip: 'application/zip'
	}[ext] || 'text/plain';
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
			if (response) {
				servedFromCache[url] = true;
				return response;
			}
			return fetch(url);
		});
	});
}

function isCached (id) {
	return servedFromCache[getMiniManifestUrl(id)];
}

function createZipReader (data) {
	return new Promise(function (fulfill, reject) {
		zip.createReader(new zip.ArrayBufferReader(data), fulfill, reject);
	});
}

function extractFile (zipReader, path, asText) {
	return new Promise(function (fulfill, reject) {
		function callback (data) {
			if (asText) {
				fulfill(data);
			} else {
				fulfill(getResponse(data, getContentType(path.replace(/.*\./, ''))));
			}
		}

		zipReader.getEntries(function (entries) {
			var i, entry;
			for (i = 0; i < entries.length; i++) {
				entry = entries[i];
				if (entry.filename === path) {
					entry.getData(new zip[asText ? 'TextWriter' : 'BlobWriter'](), callback);
					return;
				}
			}
			reject();
		});
	});
}

function getMiniManifestUrl (id) {
	return SERVER + '/' + id + '/github.manifest.webapp';
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
	}).then(createZipReader);
}

function getZip (id) {
	if (!tempZipCache[id]) {
		tempZipCache[id] = createZipPromise(id);
	}
	return tempZipCache[id];
}

function isSpecialPath (path) {
	return path === 'manifest.json';
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
		return dropAbsolutePath(manifest.launch_path);
	});
}

function fixRootFile (id, html) {
	return getMetadata(id).then(function (manifest) {
		var icons;
		icons = getIcons(manifest.icons).map(function (icon) {
			return '<link rel="icon" type="' + icon.type + '" sizes="' + icon.sizes + '" href="' + icon.src + '">';
		});
		if (isCached(id)) {
			icons.push('<link rel="manifest" href="manifest.json">');
		}
		return html
			.replace(/<script>[^<>]*serviceWorker[^<>]*<\/script>/, '')
			.replace(/<link rel="((apple-touch-|mask-|shortcut )?icon|manifest)" [^<>]*>/g, '')
			.replace(/<meta name="(msapplication-config|theme-color)" [^<>]*>/g, '')
			.replace(/(<meta charset="[^<>]*>)/, '$1\n' + icons.join('\n'));
	});
}

function getRootFile (id, path) {
	return getZip(id).then(function (zip) {
		return extractFile(zip, path, true).then(function (html) {
			return fixRootFile(id, html).then(function (html) {
				return getResponse(html, getContentType('html'));
			});
		});
	});
}

function getSpecialFile (id/*, path*/) {
	//path === 'manifest.json'
	//TODO
	return getMetadata(id).then(function (manifest) {
		var data = {
			name: manifest.name,
			icons: getIcons(manifest.icons),
			display: 'standalone'
		};
		if (manifest.orientation) {
			data.orientation = manifest.orientation;
		}
		return getResponse(JSON.stringify(data), getContentType('json'));
	});
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
		return extractFile(zip, path);
	});
}

return {
	servedFromCache: servedFromCache,
	openCache: openCache,
	fetchFile: fetchFile,
	getMiniManifestUrl: getMiniManifestUrl,
	getZipUrl: getZipUrl,
	getFile: getFile
};

})();
