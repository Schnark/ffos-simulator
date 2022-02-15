ZipArchive =
(function () {
"use strict";

function stringFromArray (array) {
	return (new TextDecoder()).decode(array);
}

function makeArraybuffer (oldArray) {
	var arraybuffer = new ArrayBuffer(oldArray.length),
		newArray = new Uint8Array(arraybuffer);
	newArray.set(oldArray);
	return arraybuffer;
}

function uncompress (entry, string) {
	var data;
	if (entry.bitflag & 1) {
		throw new Error('File is encrypted');
	}
	switch (entry.compressionMethod) {
	case 0:
		data = entry.data;
		break;
	case 8:
		data = pako.inflateRaw(entry.data);
		break;
	default:
		throw new Error('Unknown compression type: ' + entry.compression);
	}
	if (string) {
		return stringFromArray(data);
	} else {
		return makeArraybuffer(data);
	}
}

function decodeDate (rawDate) {
	var date = (rawDate & 0xffff0000) >> 16,
		time = rawDate & 0x0000ffff;
	return new Date(
		1980 + ((date & 0xfe00) >> 9),
		((date & 0x01e0) >> 5) - 1,
		date && 0x001f,
		(time & 0xf800) >> 11,
		(time & 0x07e0) >> 5,
		(time & 0x001f) * 2,
		0
	);
}

function decodeString (rawString, legacy) {
	if (legacy) {
		return [].map.call(rawString, function (code) { //CP 437
			if (code < 0x80) {
				return String.fromCharCode(code);
			}
			return [
				'\u00c7', '\u00fc', '\u00e9', '\u00e2', '\u00e4', '\u00e0', '\u00e5', '\u00e7',
				'\u00ea', '\u00eb', '\u00e8', '\u00ef', '\u00ee', '\u00ec', '\u00c4', '\u00c5',
				'\u00c9', '\u00e6', '\u00c6', '\u00f4', '\u00f6', '\u00f2', '\u00fb', '\u00f9',
				'\u00ff', '\u00d6', '\u00dc', '\u00a2', '\u00a3', '\u00a5', '\u20a7', '\u0192',
				'\u00e1', '\u00ed', '\u00f3', '\u00fa', '\u00f1', '\u00d1', '\u00aa', '\u00ba',
				'\u00bf', '\u2310', '\u00ac', '\u00bd', '\u00bc', '\u00a1', '\u00ab', '\u00bb',
				'\u2591', '\u2592', '\u2593', '\u2502', '\u2524', '\u2561', '\u2562', '\u2556',
				'\u2555', '\u2563', '\u2551', '\u2557', '\u255d', '\u255c', '\u255b', '\u2510',
				'\u2514', '\u2534', '\u252c', '\u251c', '\u2500', '\u253c', '\u255e', '\u255f',
				'\u255a', '\u2554', '\u2569', '\u2566', '\u2560', '\u2550', '\u256c', '\u2567',
				'\u2568', '\u2564', '\u2565', '\u2559', '\u2558', '\u2552', '\u2553', '\u256b',
				'\u256a', '\u2518', '\u250c', '\u2588', '\u2584', '\u258c', '\u2590', '\u2580',
				'\u03b1', '\u00df', '\u0393', '\u03c0', '\u03a3', '\u03c3', '\u00b5', '\u03c4',
				'\u03a6', '\u0398', '\u03a9', '\u03b4', '\u221e', '\u03c6', '\u03b5', '\u2229',
				'\u2261', '\u00b1', '\u2265', '\u2264', '\u2320', '\u2321', '\u00f7', '\u2248',
				'\u00b0', '\u2219', '\u00b7', '\u221a', '\u207f', '\u00b2', '\u25a0', '\u00a0'
			][code - 0x80];
		}).join('');
	}
	return stringFromArray(rawString);
}

function ZipArchive (arraybuffer) {
	var offset = 0, data = new DataView(arraybuffer), result;

	function getUint32 () {
		var val = data.getUint32(offset, true);
		offset += 4;
		return val;
	}

	function getUint16 () {
		var val = data.getUint16(offset, true);
		offset += 2;
		return val;
	}

	function getEntry () {
		var entry = {},
			length, nameLength, extraLength, commentLength, headerOffset, nextEntryIndex;
		if (getUint32() !== 0x02014b50) {
			throw new Error('No central file header signature');
		}
		entry.versionCreated = getUint16();
		entry.version = getUint16();
		entry.bitflag = getUint16();
		entry.compressionMethod = getUint16();
		entry.lastMod = decodeDate(getUint32());
		entry.crc32 = getUint32();
		entry.compressedSize = getUint32();
		entry.uncompressedSize = getUint32();
		nameLength = getUint16();
		extraLength = getUint16();
		commentLength = getUint16();
		entry.disk = getUint16();
		entry.internalAttr = getUint16();
		entry.externalAttr = getUint32();
		headerOffset = getUint32();
		entry.name = decodeString(new Uint8Array(arraybuffer, offset, nameLength), !(entry.bitflag & 0x0800));
		entry.extra = new Uint8Array(arraybuffer, offset + nameLength, extraLength);
		entry.comment = decodeString(new Uint8Array(arraybuffer, offset + nameLength + extraLength, commentLength), !(entry.bitflag & 0x0800));
		nextEntryIndex = offset + nameLength + extraLength + commentLength;
		offset = headerOffset;
		if (getUint32() !== 0x04034b50) {
			throw new Error('No local file header signature');
		}
		offset += 22;
		nameLength = getUint16();
		extraLength = getUint16();
		entry.data = new Uint8Array(arraybuffer, offset + nameLength + extraLength, entry.compressedSize);
		offset = nextEntryIndex;
		return entry;
	}

	function getCommentAndEntries () {
		var entries = [],
			start, count, start, comment, i;
		for (start = arraybuffer.byteLength - 22; start > 0; start--) {
			offset = start;
			if (getUint32() === 0x06054b50) {
				offset += 4; //disknumber, startdisknumber
				count = getUint16();
				offset += 6; //totalcount, size
				start = getUint32();
				comment = new Uint8Array(arraybuffer, offset, getUint16());
				offset = start;
				for (i = 0; i < count; i++) {
					entries.push(getEntry());
				}
				return {
					comment: comment,
					entries: entries
				};
			}
		}
		throw new Error('No central dir signature');
	}

	result = getCommentAndEntries();
	this.comment = result.comment;
	this.entries = result.entries;
}

ZipArchive.prototype.getComment = function (legacy) {
	return decodeString(this.comment, legacy);
};

ZipArchive.prototype.getEntries = function () {
	return this.entries.map(function (entry) {
		return entry.name;
	});
};

ZipArchive.prototype.getRawEntry = function (name) {
	var entry = typeof name === 'number' ? this.entries[name] : this.entries.filter(function (entry) {
		return entry.name === name;
	})[0];
	if (!entry) {
		throw new Error('File "' + name + '" does not exist');
	}
	return entry;
};

ZipArchive.prototype.getMetadata = function (name) {
	var entry = this.getRawEntry(name);
	return {
		name: entry.name,
		versionCreated: entry.versionCreated,
		version: entry.version,
		bitflag: entry.bitflag,
		compressionMethod: entry.compressionMethod,
		lastMod: entry.lastMod,
		crc32: entry.crc32,
		compressedSize: entry.compressedSize,
		uncompressedSize: entry.uncompressedSize,
		disk: entry.disk,
		internalAttr: entry.internalAttr,
		externalAttr: entry.externalAttr,
		extra: entry.extra,
		comment: entry.comment
	};
};

ZipArchive.prototype.getCompressedData = function (name) {
	return this.getRawEntry(name).data;
};

ZipArchive.prototype.getData = function (name, string) {
	return uncompress(this.getRawEntry(name), string);
};

return ZipArchive;
})();