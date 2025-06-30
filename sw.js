/*global importScripts, Promise*/
(function (worker) {
"use strict";

var DEBUG = '', //'a', 'b', ...
	VERSION = '2.3' + DEBUG,
	FILES = [
		'zip/pako.min.js',
		'zip/zip.js',
		'sw/ffos.js',
		'sw/static.js',
		'sw/update.js',
		'sw/util.js',
		'app-manager.js',
		'icon.svg',
		'index.html',
		'script.js',
		'style.css'
	];

/*global SERVER, BASE, CACHE, UPDATE_INTERVAL*/
worker.SERVER = DEBUG ? 'http://localhost:8000' : 'https://schnark.github.io';
worker.BASE = SERVER + '/ffos-simulator/';
worker.MANIFEST = 'github.manifest.webapp';
worker.CACHE = 'ffos-simulator';
worker.UPDATE_INTERVAL = DEBUG ? 60 * 1000 : 24 * 60 * 60 * 1000;

importScripts('zip/pako.min.js');
importScripts('zip/zip.js');

/*global util*/
importScripts('sw/util.js');

/*global ffos*/
importScripts('sw/ffos.js');

/*global staticFiles*/
importScripts('sw/static.js');

if (UPDATE_INTERVAL) {
	importScripts('sw/update.js');
}

function answerQuery (type, args) {
	var allowedFn = [
		'install',
		'update',
		'uninstall',
		'checkInstalled',
		'checkUpdate',
		'getList',
		'getUpdates'
	];
	if (allowedFn.indexOf(type) === -1) {
		return Promise.reject('Unknown function');
	}
	return ffos[type].apply(ffos, args);
}

worker.addEventListener('install', function (e) {
	e.waitUntil(staticFiles.install(CACHE + '-static:' + VERSION, FILES).then(function () {
		return worker.skipWaiting();
	}));
});

worker.addEventListener('activate', function (e) {
	e.waitUntil(staticFiles.removeOldCache(CACHE + '-static:', VERSION).then(function () {
		return worker.clients.claim();
	}));
});

worker.addEventListener('fetch', function (e) {
	var url = e.request.url, searchPos, pathPos, response;
	if (url.startsWith(BASE)) {
		url = url.slice(BASE.length);
		searchPos = url.indexOf('?');
		if (searchPos > -1) {
			url = url.slice(0, searchPos);
		}
		if (url === '') {
			url = 'index.html';
		}
		if (FILES.indexOf(url) > -1) {
			response = staticFiles.getFile(BASE + url);
		} else if (url.startsWith('.options/')) {
			url = url.slice('.options/'.length);
			pathPos = url.indexOf('/');
			if (pathPos === -1) {
				response = ffos.options.get(url);
			} else {
				response = ffos.options.set(url.slice(0, pathPos), url.slice(pathPos + 1));
			}
		} else {
			pathPos = url.indexOf('/');
			if (pathPos > -1 && ffos.getIdType(url.slice(0, pathPos))) {
				response = ffos.getFile(url.slice(0, pathPos), url.slice(pathPos + 1));
			}
		}
	}
	if (response) {
		e.respondWith(response.catch(function (error) {
			return util.getResponse(String(error), util.getContentType('txt'), 404);
		}));
	}
});

worker.addEventListener('message', function (e) {
	e.waitUntil(worker.clients.get(e.source.id).then(function (client) {
		var data = {};
		data.key = e.data.key;
		answerQuery(e.data.type, e.data.args).then(function (result) {
			data.success = true;
			data.result = result;
			client.postMessage(data);
		}, function (result) {
			data.result = result;
			client.postMessage(data);
		});
	}));
});

})(this);
