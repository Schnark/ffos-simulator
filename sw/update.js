/*global BASE, UPDATE_INTERVAL, ffos*/
/*global Promise*/
(function (worker) {
"use strict";

var alreadyChecked = false;

function getOptionText (name) {
	return ffos.options.get(name).then(function (option) {
		return option.text();
	});
}

function getUpdateMode () {
	return getOptionText('update-mode').then(function (mode) {
		if (mode !== 'check' && mode !== 'update') {
			return false;
		}
		return getOptionText('last-check').then(function (check) {
			if (!check || (Date.now() - check > UPDATE_INTERVAL)) {
				return mode;
			}
			return false;
		});
	});
}

function runUpdates (apps) {
	return Promise.all(apps.map(function (app) {
		return ffos.update(app).then(function () {
			return app;
		}, function () {
			//TODO notification?
			return false;
		});
	})).then(function (list) {
		return list.filter(function (app) {
			return app;
		});
	});
}

function setLastCheck () {
	return ffos.options.set('last-check', String(Date.now()));
}

function getMsg (apps, updated) {
	//TODO
	var msg;
	if (updated) {
		msg = 'Apps updated: %a';
	} else {
		msg = 'Updates available: %a';
	}
	msg = msg.replace('%a', apps.join(', '));
	return {
		title: 'FFOS Simulator',
		body: msg,
		lang: 'en'
	};
}

function showNotification (list, sizes) {
	var msg, link, autoClose;
	if (list.length === 0) {
		return;
	}
	if (sizes) {
		msg = getMsg(list, false);
		link = BASE + 'index.html?mode=update&apps=' + list.join('|') + '&sizes=' + sizes.join('|');
	} else {
		msg = getMsg(list, true);
		autoClose = true;
	}
	return worker.registration.showNotification(msg.title, {
		body: msg.body,
		lang: msg.lang,
		requireInteraction: !autoClose,
		data: {
			link: link
		}
	});
}

function runUpdateCheck () {
	return getUpdateMode().then(function (mode) {
		if (!mode) {
			return;
		}
		return ffos.getUpdates().then(function (updates) {
			var names = updates.map(function (app) {
				return app.name;
			});
			if (mode === 'check') {
				return showNotification(names, updates.map(function (app) {
					return app.size;
				})).then(setLastCheck);
			} else {
				return runUpdates(names).then(function (list) {
					return showNotification(list).then(setLastCheck);
				});
			}
		});
	});
}

//NOTE for some reason this didn't work in my test,
//I hope it is only a buggy notification system of xfce
worker.addEventListener('notificationclick', function (e) {
	e.notification.close();
	if (e.notification.data.link) {
		e.waitUntil(worker.clients.openWindow(e.notification.data.link));
	}
});

//NOTE this should use periodic background sync, but this is much simpler
worker.addEventListener('fetch', function (e) {
	if (navigator.onLine && !alreadyChecked) {
		alreadyChecked = true;
		e.waitUntil(runUpdateCheck());
	}
});

})(this);