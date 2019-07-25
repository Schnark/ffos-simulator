/*global staticFiles: true*/
/*global caches, Promise, fetch*/
staticFiles =
(function () {
"use strict";

function install (cacheKey, files) {
	return caches.open(cacheKey).then(function (cache) {
		return cache.addAll(files);
	});
}

function removeOldCache (cachePrefix, version) {
	return caches.keys().then(function (keys) {
		return Promise.all(keys.map(function (key) {
			if (key.indexOf(cachePrefix) === 0 && key !== cachePrefix + version) {
				return caches.delete(key);
			}
		}));
	});
}

function getFile (request) {
	return caches.match(request).then(function (response) {
		return response || fetch(request);
	});
}

return {
	install: install,
	removeOldCache: removeOldCache,
	getFile: getFile
};

})();