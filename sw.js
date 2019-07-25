/*global importScripts*/
(function (worker) {
"use strict";

/*global SERVER, BASE, CACHE*/
worker.SERVER = 'https://schnark.github.io'; //'http://localhost:8080'
worker.BASE = SERVER + '/ffos-simulator/';
worker.CACHE = 'ffos-simulator';

var VERSION = 1,
	FILES = [
		'zip/zip.js',
		'zip/ArrayBufferReader.js',
		'zip/deflate.js',
		'zip/inflate.js',
		'sw/ffos.js',
		'sw/install.js',
		'sw/static.js',
		'index.html',
		'script.js'
	];

/*global zip*/
importScripts('zip/zip.js');
importScripts('zip/ArrayBufferReader.js');
importScripts('zip/deflate.js');
importScripts('zip/inflate.js');

zip.useWebWorkers = false;

/*global ffos*/
importScripts('sw/ffos.js');

/*global answerQuery*/
importScripts('sw/install.js');

/*global staticFiles*/
importScripts('sw/static.js');

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
	var url = e.request.url, parts;
	if (url.slice(0, BASE.length) === BASE) {
		url = url.slice(BASE.length);
		if (FILES.indexOf(url) > -1) {
			e.respondWith(staticFiles.getFile(e.request));
		} else {
			parts = /^([a-z\-]+)\/([^?]*)/.exec(url);
		}
	}
	if (parts) {
		e.respondWith(ffos.getFile(parts[1], parts[2]));
	}
});

worker.addEventListener('message', function (e) {
	worker.clients.get(e.source.id).then(function (client) {
		var data;
		data = e.data;
		answerQuery(data.type, data.id).then(function (result) {
			data.result = result;
			client.postMessage(data);
		}, function () {
			data.result = 'failed';
			client.postMessage(data);
		});
	});
});

})(this);
