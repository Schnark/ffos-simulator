/*global appManager*/
/*global Promise, Notification, URL, alert, fetch*/
(function () {
"use strict";

var allApps = [
		'barcode-reader',
		'calender',
		'deng',
		'docviewer',
		'emoticons',
		'fall',
		//'ffosapp-installer', (doesn't work in modern browsers)
		'fortune',
		'mandelbrot',
		'math',
		'music-editor',
		'musicmetadata',
		'racer',
		'random',
		'redirector',
		'rss',
		'ruler-protractor',
		//'stundenbuch', (needs password)
		'sudoku',
		'timezone-converter',
		'tts',
		'unicode',
		'wallpaper',
		'web-playground',
		'word-map-skiller'
	],
	pages = {}, navlinks = {}, currentPage = 'loading';

function htmlEscape (str) {
	return String(str)
		.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
		.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatSize (size) {
	var sizes = ['B', 'KB', 'MB', 'GB'];
	while (sizes.length && size > 900) {
		size /= 1024;
		sizes.shift();
	}
	size = Math.round(size * 10) / 10;
	return size + ' ' + sizes[0];
}

function getIconSrc (icons) {
	return icons[0].src; //TODO pick best icon
}

function getUrlParams (url) {
	var params = {};
	(url || location.search).slice(1).split('&').forEach(function (str) {
		var pos = str.indexOf('='), key, val;
		if (pos !== -1) {
			key = decodeURIComponent(str.slice(0, pos));
			val = decodeURIComponent(str.slice(pos + 1));
			params[key] = val;
		}
	});
	return params;
}

function showPage (page) {
	pages[currentPage].hidden = true;
	navlinks[currentPage].className = '';
	currentPage = page;
	pages[currentPage].hidden = false;
	navlinks[currentPage].className = 'current';
	return pages[currentPage];
}

function getAppInfo (app) {
	return appManager.checkInstalled(app).then(function (isInstalled) {
		return fetch(app + '/manifest.json').then(function (manifest) {
			return manifest.json();
		}).then(function (manifest) {
			return {
				id: app,
				isInstalled: isInstalled,
				name: manifest.name,
				description: manifest.description,
				lang: manifest.lang,
				icon: getIconSrc(manifest.icons)
			};
		});
	});
}

function formatAppInfo (info) {
	return [
		'<h2 lang="' + htmlEscape(info.lang) + '">' + htmlEscape(info.name) + '</h2>',
		'<p><img alt="" src="' + htmlEscape(info.id + '/' + info.icon) + '"></p>',
		'<p lang="' + htmlEscape(info.lang) + '">' + htmlEscape(info.description) + '</p>',
		'<p><a href="' + info.id + '/">Run app</a></p>',
		'<p><a href="' + info.id + '/zip-content.html">Show contents</a></p>',
		info.isInstalled ? '' : '<p><button data-action="install" data-id="' + info.id + '">Install</button></p>',
		info.isInstalled ? '<p><button data-action="uninstall" data-id="' + info.id + '">Uninstall</button></p>' : '',
		info.isInstalled ? '<p id="app-info-update">' +
			'<button id="app-info-update-button" data-action="check-update" data-id="' + info.id +
			'">Check for update</button></p>' : ''
	].join('');
}

function formatAppSelect (installed, all) {
	var hasInstalled = installed.length > 0;

	function makeOption (id) {
		return '<option>' + id + '</option>';
	}

	return [
		'<h2>Apps</h2>',
		'<p><select id="app-select">',
		hasInstalled ? '<optgroup label="Installed apps">' : '',
		installed.map(makeOption).join(''),
		hasInstalled ? '</optgroup><optgroup label="Suggested apps">' : '',
		all.map(makeOption).join(''),
		hasInstalled ? '</optgroup>' : '',
		'</select> <button data-action="info">Select</button></p>'
	].join('');
}

function runInstall (id, button) {
	button.innerHTML = 'Please wait …';
	button.disabled = true;
	appManager.install(id).then(
		function () {
			button.innerHTML = 'Installed';
		},
		function () {
			button.innerHTML = 'Installing failed';
		}
	);
}

function runUninstall (id, button) {
	button.innerHTML = 'Please wait …';
	button.disabled = true;
	appManager.uninstall(id).then(
		function () {
			button.innerHTML = 'Uninstalled';
			document.getElementById('app-info-update').remove();
		},
		function () {
			button.innerHTML = 'Uninstalling failed';
		}
	);
}

function runCheckUpdate (id, button) {
	button.innerHTML = 'Please wait …';
	button.disabled = true;
	appManager.checkUpdate(id).then(
		function (hasUpdate) {
			if (hasUpdate) {
				button.innerHTML = 'Update';
				button.disabled = false;
				button.dataset.action = 'update';
			} else {
				button.innerHTML = 'No update available';
			}
		},
		function () {
			button.innerHTML = 'Checking for updates failed';
		}
	);
}

function runUpdate (id, button) {
	button.innerHTML = 'Please wait …';
	button.disabled = true;
	appManager.update(id).then(
		function () {
			button.innerHTML = 'Updated';
		},
		function () {
			button.innerHTML = 'Updating failed';
		}
	);
}

function runInstall2 (idOrUrl, button) {
	var oldHtml = button.innerHTML;
	button.innerHTML = 'Please wait …';
	button.disabled = true;
	appManager.install(idOrUrl).then(
		function (id) {
			history.pushState({}, '', '?mode=app&app=' + id);
			showApp({app: id});
		},
		function (error) {
			alert('An error occurred: ' + error);
		}
	).finally(
		function () {
			button.innerHTML = oldHtml;
			button.disabled = false;
		}
	);
}

function getNotificationPermission () {
	if (Notification.permission === 'granted') {
		return Promise.resolve(true);
	}
	return Notification.requestPermission().then(
		function (permission) {
			return permission === 'granted';
		}, function () {
			return false;
		}
	);
}

function storeUpdateOption (option, infoArea) {
	var permission;
	if (option) {
		permission = getNotificationPermission();
		infoArea.innerHTML = 'Please allow notifications.';
	} else {
		permission = Promise.resolve(true);
	}
	permission.then(function (allowed) {
		if (allowed) {
			infoArea.innerHTML = '';
			return fetch('.options/update-mode/' + option).then(
				function () {
					return true;
				}, function () {
					return false;
				}
			);
		} else {
			return false;
		}
	});
}

function showMain () {
	showPage('main');
}

function showApp (options) {
	var container = showPage('app');
	if (options.app) {
		getAppInfo(options.app).then(
			function (info) {
				container.innerHTML = formatAppInfo(info);
			},
			function (error) {
				container.innerHTML = '<h2>App</h2><p>An error occurred: ' + htmlEscape(error) + '</p>';
			}
		);
	} else {
		container.innerHTML = formatAppSelect([], allApps);
		appManager.getList().then(function (installed) {
			container.innerHTML = formatAppSelect(installed, allApps);
		});
	}
}

function showInstall () {
	showPage('install');
}

function showUpdate (options) {
	var container;

	function show (apps, sizes) {
		var list;
		if (apps.length === 0) {
			container.innerHTML = '<h2>Updates</h2><p>No updates available.</p>';
			return;
		}
		list = apps.map(function (app, i) {
			var size = sizes[i] || 0;
			return '<li>' + app + (size ? ' (' + formatSize(size) + ')' : '') +
				' <button data-action="update" data-id="' + app + '">Update</button></li>';
		});
		container.innerHTML = '<h2>Updates</h2><ul>' + list.join('') + '</ul>';
		//TODO Update all
	}

	container = showPage('update');

	if (options.app) {
		history.replaceState({}, '', '?mode=update');
		show(options.app.split('|'), (options.size || '').split('|'));
	} else {
		container.innerHTML = '<h2>Updates</h2><p>Please wait …</p>';
		appManager.getUpdates().then(function (list) {
			show(
				list.map(function (app) {
					return app.name;
				}),
				list.map(function (app) {
					return app.size;
				})
			);
		}, function (error) {
			container.innerHTML = '<h2>Updates</h2><p>An error occurred: ' + htmlEscape(error) + '</p>';
		});
	}
}

function showOptions () {
	showPage('options');
}

function showAbout () {
	showPage('about');
}

function navigate (url) {
	var params = getUrlParams(url);
	switch (params.mode) {
	case 'app':
		showApp(params);
		break;
	case 'install':
		showInstall(params);
		break;
	case 'update':
		showUpdate(params);
		break;
	case 'options':
		showOptions(params);
		break;
	case 'about':
		showAbout(params);
		break;
	default:
		showMain(params);
	}
}

function initStorageManage (area) {
	var infoArea, persistArea;
	if (!navigator.storage) {
		return;
	}
	area.innerHTML = '<h2>Storage</h2><p id="info-area"></p><p id="persist-area"></p>';
	infoArea = document.getElementById('info-area');
	persistArea = document.getElementById('persist-area');
	navigator.storage.estimate().then(function (estimate) {
		infoArea.textContent = 'Used storage: ' +
			formatSize(estimate.usage) + '/' + formatSize(estimate.quota) + ' ' +
			'(' + Math.round(100 * estimate.usage / estimate.quota) + ' %)';
	});
	navigator.storage.persisted().then(function (persisted) {
		if (persisted) {
			persistArea.textContent = 'Storage persisted';
		} else {
			persistArea.innerHTML = '<button id="persist-button">Persist storage</button>';
			document.getElementById('persist-button').addEventListener('click', function () {
				navigator.storage.persist().then(function (persist) {
					persistArea.textContent = persist ? 'Storage persisted' : 'Persisting storage failed';
				});
			});
		}
	});
}

function init () {
	var updateModeSelect = document.getElementById('update-mode'),
		infoArea = document.getElementById('info-area');
	pages.loading = document.getElementById('loading');
	pages.main = document.getElementById('main');
	pages.app = document.getElementById('app');
	pages.install = document.getElementById('install');
	pages.update = document.getElementById('update');
	pages.options = document.getElementById('options');
	pages.about = document.getElementById('about');
	navlinks.loading = {};
	navlinks.main = document.getElementById('navlink-main');
	navlinks.app = document.getElementById('navlink-app');
	navlinks.install = document.getElementById('navlink-install');
	navlinks.update = document.getElementById('navlink-update');
	navlinks.options = document.getElementById('navlink-options');
	navlinks.about = document.getElementById('navlink-about');
	document.getElementsByTagName('nav')[0].hidden = false;
	document.getElementById('install-id-suggest').innerHTML = '<option>' + allApps.join('</option><option>') + '</option>';
	fetch('.options/update-mode').then(function (mode) {
		return mode.text();
	}).then(function (mode) {
		updateModeSelect.value = mode;
	});
	updateModeSelect.addEventListener('change', function () {
		storeUpdateOption(updateModeSelect.value, infoArea);
	});
	initStorageManage(document.getElementById('storage-manager'));
	//TODO call caches.keys().then(function (keys) {}), show the list and allow user to delete caches
	document.getElementsByTagName('body')[0].addEventListener('click', function (e) {
		var id;
		switch (e.target.dataset.action) {
		case 'url':
			history.pushState({}, '', e.target.href);
			navigate();
			e.preventDefault();
			break;
		case 'info':
			id = document.getElementById('app-select').value;
			history.pushState({}, '', '?mode=app&app=' + id);
			showApp({app: id});
			break;
		case 'install':
			runInstall(e.target.dataset.id, e.target);
			break;
		case 'uninstall':
			runUninstall(e.target.dataset.id, e.target);
			break;
		case 'check-update':
			runCheckUpdate(e.target.dataset.id, e.target);
			break;
		case 'update':
			runUpdate(e.target.dataset.id, e.target);
			break;
		case 'install-id':
			runInstall2(document.getElementById('install-id').value, e.target);
			break;
		case 'install-url':
			runInstall2(document.getElementById('install-url').value, e.target);
			break;
		case 'install-file':
			runInstall2(URL.createObjectURL(document.getElementById('install-file').files[0]), e.target);
		}
	});
	window.addEventListener('popstate', function () {
		navigate();
	});

	navigate();
}

if (appManager.isCompatible()) {
	appManager.init().then(init);
} else {
	document.getElementById('loading').innerHTML = '<p>Sorry, your browser doesn’t support ServiceWorkers.</p>';
}

})();