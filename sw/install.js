/*global answerQuery: true*/
/*global ffos*/
answerQuery =
(function () {
"use strict";

function install (id) {
	return ffos.openCache().then(function (cache) {
		return cache.add(ffos.getMiniManifestUrl(id)).then(function () {
			return ffos.getZipUrl(id).then(function (url) {
				return cache.add(url);
			});
		});
	});
}

function uninstall (id) {
	ffos.servedFromCache[ffos.getMiniManifestUrl(id)] = false;
	return ffos.openCache().then(function (cache) {
		return ffos.getZipUrl(id).then(function (url) {
			return cache.delete(url).then(function () {
				return cache.delete(ffos.getMiniManifestUrl(id));
			});
		});
	});
}

function checkInstalled (id) {
	return ffos.openCache().then(function (cache) {
		return cache.match(ffos.getMiniManifestUrl(id)).then(function (response) {
			return !!response;
		});
	});
}

function checkUpdate (id) {
	return ffos.fetchFile(ffos.getMiniManifestUrl(id), true).then(function (manifest) {
		return manifest.text();
	}).then(function (newManifest) {
		return ffos.fetchFile(ffos.getMiniManifestUrl(id)).then(function (manifest) {
			return manifest.text();
		}).then(function (oldManifest) {
			return oldManifest !== newManifest;
		});
	});
}

function answerQuery (type, id) {
	switch (type) {
	case 'install': case 'update': return install(id);
	case 'uninstall': return uninstall(id);
	case 'check-installed': return checkInstalled(id);
	case 'check-update': return checkUpdate(id);
	}
}

return answerQuery;
})();