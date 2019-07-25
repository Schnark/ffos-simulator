/*global Promise*/
(function () {
"use strict";

var waitingQueries = {},
	SCRIPTS = [
		'barcode-reader',
		'calender',
		'docviewer',
		'emoticons',
		'fall',
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
		'sudoku',
		'timezone-converter',
		'tts',
		'unicode',
		'wallpaper',
		'web-playground',
		'word-map-skiller'
	];

function sendQuery (type, id) {
	return new Promise(function (fulfill, reject) {
		waitingQueries[type + ':' + id] = {
			fulfill: fulfill,
			reject: reject
		};
		navigator.serviceWorker.controller.postMessage({
			type: type,
			id: id
		});
	});
}

function initQueries () {
	navigator.serviceWorker.addEventListener('message', function (e) {
		var key = e.data.type + ':' + e.data.id;
		if (waitingQueries[key]) {
			if (e.data.result === 'failed') {
				waitingQueries[key].reject();
			} else {
				waitingQueries[key].fulfill(e.data.result);
			}
			delete waitingQueries[key];
		}
	});
}

document.addEventListener('click', function (e) {
	var data = e.target.dataset;
	switch (data.type) {
	case 'install':
		install(data.id);
		break;
	case 'update':
		update(data.id);
		break;
	case 'uninstall':
		uninstall(data.id);
		break;
	case 'check-update':
		checkUpdate(data.id);
	}
});

function getField (id, type) {
	return document.getElementById(id).getElementsByClassName(type)[0];
}

function makeButton (id, type, label) {
	return '<button data-type="' + type + '" data-id="' + id + '">' + label + '</button>';
}

function install (id) {
	getField(id, 'install').innerHTML = 'please wait …';
	sendQuery('install', id).then(function () {
		getField(id, 'install').innerHTML = makeButton(id, 'uninstall', 'Uninstall');
	}, function () {
		getField(id, 'install').innerHTML = 'failed';
	});
}

function uninstall (id) {
	getField(id, 'install').innerHTML = 'please wait …';
	getField(id, 'update').innerHTML = '–';
	sendQuery('uninstall', id).then(function () {
		getField(id, 'install').innerHTML = makeButton(id, 'install', 'Install');
	}, function () {
		getField(id, 'install').innerHTML = 'failed';
	});
}

function update (id) {
	getField(id, 'update').innerHTML = 'please wait …';
	sendQuery('update', id).then(function () {
		getField(id, 'update').innerHTML = '–';
	}, function () {
		getField(id, 'update').innerHTML = 'failed';
	});
}

function checkUpdate (id) {
	getField(id, 'update').innerHTML = 'please wait …';
	sendQuery('check-update', id).then(function (update) {
		if (update) {
			getField(id, 'update').innerHTML = makeButton(id, 'update', 'Update');
		} else {
			getField(id, 'update').innerHTML = 'up to date';
		}
	}, function () {
		getField(id, 'update').innerHTML = 'failed';
	});
}

function checkInstalled (id) {
	sendQuery('check-installed', id).then(function (installed) {
		if (installed) {
			getField(id, 'install').innerHTML = makeButton(id, 'uninstall', 'Uninstall');
			getField(id, 'update').innerHTML = makeButton(id, 'check-update', 'Check');
		} else {
			getField(id, 'install').innerHTML = makeButton(id, 'install', 'Install');
		}
	}, function () {
		getField(id, 'install').innerHTML = 'failed';
	});
}

function showTable () {
	var html = [];
	html = SCRIPTS.map(function (id) {
		return '<tr id="' + id + '">' +
			'<td><a href="' + id + '/">' + id + '</a></td>' +
			'<td class="install">please wait …</td>' +
			'<td class="update">–</td>' +
			'</tr>';
	});
	html.unshift('<tr><th>Script</th><th>Install/Uninstall</th><th>Update</th></tr>');
	document.getElementsByTagName('body')[0].innerHTML = '<table>' + html.join('') + '</table>';
	SCRIPTS.forEach(checkInstalled);
}

function init () {
	navigator.serviceWorker.register('sw.js');
	initQueries();
	if (navigator.serviceWorker.controller) {
		showTable();
	} else {
		navigator.serviceWorker.addEventListener('controllerchange', function () {
			if (navigator.serviceWorker.controller) {
				showTable();
			}
		});
	}
}

if (navigator.serviceWorker) {
	init();
} else {
	document.getElementsByTagName('body')[0].innerHTML = 'Sorry, your browser doesn’t support ServiceWorkers.';
}

})();
