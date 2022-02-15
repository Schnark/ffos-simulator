/*global appManager: true*/
/*global Promise*/

appManager =
(function () {
"use strict";

var waitingQueries = {};

function sendQuery (type, args) {
	var key, promise;
	key = type + ':' + JSON.stringify(args);
	if (waitingQueries[key]) {
		return waitingQueries[key].promise;
	}
	promise = new Promise(function (fulfill, reject) {
		waitingQueries[key] = {
			promise: promise,
			fulfill: fulfill,
			reject: reject
		};
		navigator.serviceWorker.controller.postMessage({
			key: key,
			type: type,
			args: args
		});
	});
	return promise;
}

function initQueries () {
	navigator.serviceWorker.addEventListener('message', function (e) {
		var key = e.data.key;
		if (waitingQueries[key]) {
			if (e.data.success) {
				waitingQueries[key].fulfill(e.data.result);
			} else {
				waitingQueries[key].reject(e.data.result);
			}
			delete waitingQueries[key];
		}
	});
}

function isCompatible () {
	return !!navigator.serviceWorker;
}

function init () {
	return new Promise(function (fulfill) {
		navigator.serviceWorker.register('sw.js');
		initQueries();
		if (navigator.serviceWorker.controller) {
			fulfill();
		} else {
			navigator.serviceWorker.addEventListener('controllerchange', function () {
				if (navigator.serviceWorker.controller) {
					fulfill();
				}
			});
		}
	});
}

return {
	install: function (idOrUrl) {
		return sendQuery('install', [idOrUrl]);
	},
	uninstall: function (id) {
		return sendQuery('uninstall', [id]);
	},
	update: function (id) {
		return sendQuery('update', [id]);
	},
	checkUpdate: function (id) {
		return sendQuery('checkUpdate', [id]);
	},
	checkInstalled: function (id) {
		return sendQuery('checkInstalled', [id]);
	},
	getList: function () {
		return sendQuery('getList', []);
	},
	getUpdates: function () {
		return sendQuery('getUpdates', []);
	},
	isCompatible: isCompatible,
	init: init
};

})();