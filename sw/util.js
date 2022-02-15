/*global util: true*/
/*global ZipArchive*/
/*global Response, Promise, escape, unescape*/
util =
(function () {
"use strict";

function htmlEscape (str) {
	return str
		.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
		.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function aToU (a) {
	return decodeURIComponent(escape(
		atob(
			a.replace(/-/g, '+').replace(/_/g, '/')
		).replace(/\0+$/, '')
	));
}

function uToA (u) {
	return btoa(
		unescape(encodeURIComponent(u.replace(/\0+$/, '')))
	).replace(/\s+/g, '')
	.replace(/\+/g, '-').replace(/\//g, '_')
	.replace(/\=+/g, '');
}

function dropAbsolutePath (path) {
	if (path.charAt(0) === '/') {
		path = path.slice(1);
	}
	return path;
}

function getContentType (ext) {
	//TODO add missing types as needed
	var utf8 = '; charset=utf-8'; //assume utf-8 for all text that ca'n't specify encoding internally (like HTML)
	return {
		css: 'text/css' + utf8,
		gif: 'image/gif',
		htm: 'text/html',
		html: 'text/html',
		ico: 'image/x-icon',
		jpeg: 'image/jpeg',
		jpg: 'image/jpeg',
		js: 'text/javascript' + utf8,
		json: 'application/json' + utf8,
		mp3: 'audio/mpeg',
		mp4: 'video/mpeg4',
		oga: 'audio/ogg',
		ogg: 'audio/ogg',
		ogv: 'video/ogg',
		pdf: 'application/pdf',
		png: 'image/png',
		svg: 'image/svg+xml',
		webapp: 'application/x-web-app-manifest+json' + utf8,
		webm: 'video/webm',
		woff: 'application/font-woff',
		xhtml: 'text/html',
		xml: 'text/xml',
		zip: 'application/zip'
	}[ext.replace(/.*\./, '')] || 'text/plain' + utf8;
}

function getIcons (data) {
	var icons = [], icon;
	for (icon in data) {
		if (!isNaN(icon)) {
			icons.push({
				src: dropAbsolutePath(data[icon]),
				sizes: icon + 'x' + icon,
				type: getContentType(data[icon])
			});
		}
	}
	return icons;
}

function getResponse (data, type, status) {
	return new Response(data, {
		status: status || 200,
		headers: {
			'Content-Type': type
		}
	});
}

//ZIP
//the original ZIP reader was async, so the interface is still adapted to that
function createZipReader (data) {
	return Promise.resolve(new ZipArchive(data));
}

function extractFile (zipArchive, path, asText) {
	var data = zipArchive.getData(path, asText);
	if (asText) {
		return Promise.resolve(data);
	}
	return Promise.resolve(getResponse(data, getContentType(path)));
}

function getZipContent (zipArchive) {
	return Promise.resolve(zipArchive.getEntries());
}

return {
	htmlEscape: htmlEscape,
	aToU: aToU,
	uToA: uToA,
	dropAbsolutePath: dropAbsolutePath,
	getContentType: getContentType,
	getIcons: getIcons,
	getResponse: getResponse,
	zip: {
		createReader: createZipReader,
		extractFile: extractFile,
		getContent: getZipContent
	}
};
})();